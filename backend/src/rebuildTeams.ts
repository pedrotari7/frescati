import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { logger } from 'firebase-functions';
import type { AppUser, BalanceSettings, Game, Season, TournamentTeams } from '../../shared/types';
import { DEFAULT_BALANCE_SETTINGS } from '../../shared/types';
import { isConfirmed } from '../../shared/game';
import { getElo, getSeedElo } from '../../shared/rating';
import { getSeed, pickTeams } from '../../shared/optimizer';
import type { OptimizerPlayer } from '../../shared/optimizer';
import { getSquadSizes, getTeamCount } from '../../shared/tournament';
import { db, REGION } from './lib/firebase';
import { getGame, getResponses, getSeason } from './lib/data';
import type { TeamRebuildTask } from './lib/teams';

/** The levers actually in force: season defaults, overridden per game. */
const resolveSettings = (season: Season, game: Game): BalanceSettings => ({
	...DEFAULT_BALANCE_SETTINGS,
	...season.balance,
	...game.balance,
});

/**
 * Everyone whose rating matters here: the pool being picked, plus the season
 * roster. The roster is needed even for members sitting this one out, because
 * the seed for an unrated player is the average of the *season*, not of the
 * eleven people who happened to say yes.
 */
const getRatings = async (uids: string[]): Promise<Map<string, AppUser>> => {
	if (uids.length === 0) return new Map();

	const snapshots = await db.getAll(...uids.map(uid => db.doc(`users/${uid}`)));

	return new Map(
		snapshots.filter(snapshot => snapshot.exists).map(snapshot => [snapshot.id, snapshot.data() as AppUser])
	);
};

/**
 * The squads from the previous few games, most recent first — what the repeat
 * penalty is weighed against.
 *
 * Read from the games before this one by kickoff rather than by creation, so
 * inserting a one-off into the middle of a season still reads as history in the
 * order it was actually played.
 */
const getRecentSquads = async (seasonId: string, kickoff: string, lookback: number): Promise<string[][][]> => {
	if (lookback <= 0) return [];

	const games = await db
		.collection(`seasons/${seasonId}/games`)
		.where('kickoff', '<', kickoff)
		.orderBy('kickoff', 'desc')
		.limit(lookback)
		.get();

	const lineups = await db.getAll(...games.docs.map(game => game.ref.collection('tournament').doc('teams')));

	return lineups
		.filter(lineup => lineup.exists)
		.map(lineup => (lineup.data() as TournamentTeams).teams.map(team => team.uids));
};

/**
 * Re-pick the teams for one game.
 *
 * Deliberately its own function rather than part of `onResponseWrite`: the
 * optimiser is the one piece of this app whose cost grows with the turnout, and
 * a slow night must never be able to hold up the headcount everybody is
 * actually looking at.
 *
 * Retries are safe. Nothing here is incremental — the lineup is derived from
 * the pool, the ratings and a seed, so running it twice writes the same
 * document twice.
 */
export const rebuildTeams = onTaskDispatched<TeamRebuildTask>(
	{
		region: REGION,
		retryConfig: { maxAttempts: 3, minBackoffSeconds: 10 },
		// One rebuild at a time per instance. There is no rush — the work is
		// already deferred — and this keeps a busy Sunday from fanning out.
		rateLimits: { maxConcurrentDispatches: 4 },
	},
	async request => {
		const { seasonId, gameId, generation } = request.data;
		const teamsRef = db.doc(`seasons/${seasonId}/games/${gameId}/tournament/teams`);

		const game = await getGame(seasonId, gameId);

		// The game went away between queueing and running — the cascade delete
		// will have taken the lineup with it.
		if (!game) return;

		// Somebody answered after this task was queued, so a later task is
		// already on its way with fresher data. Dropping out here is what turns
		// a burst of answers into a single rebuild.
		if ((game.teamsGeneration ?? 0) !== generation) {
			logger.debug('Skipped a superseded team rebuild', { seasonId, gameId, generation });
			return;
		}

		const season = await getSeason(seasonId);
		if (!season) {
			logger.warn('Team rebuild for a game whose season has gone', { seasonId, gameId });
			return;
		}

		const responses = await getResponses(seasonId, gameId);
		const pool = responses.filter(response => response.status === 'in' && isConfirmed(response));
		const teamCount = getTeamCount(pool.length);

		// Not enough for a tournament. Clear any lineup rather than leaving a
		// stale one up — people dropping out is exactly when a team sheet from
		// an hour ago becomes actively misleading.
		if (teamCount === 0) {
			await teamsRef.delete();
			logger.debug('Cleared a lineup that no longer has the players for it', {
				seasonId,
				gameId,
				playing: pool.length,
			});
			return;
		}

		const settings = resolveSettings(season, game);
		const users = await getRatings([...new Set([...season.memberUids, ...pool.map(response => response.uid)])]);

		const seedElo = getSeedElo(
			season.memberUids
				.map(uid => users.get(uid)?.rating?.elo)
				.filter((elo): elo is number => typeof elo === 'number')
		);

		const players: OptimizerPlayer[] = pool.map(response => ({
			uid: response.uid,
			elo: getElo(users.get(response.uid)?.rating, seedElo),
		}));

		const teams = pickTeams({
			players,
			squadSizes: getSquadSizes(pool.length, teamCount),
			seed: getSeed(gameId, game.reshuffleCount ?? 0),
			settings,
			history: await getRecentSquads(seasonId, game.kickoff, settings.repeatLookback),
		});

		const lineup: TournamentTeams = {
			teams,
			// Snapshotted so the screen can show what each player was rated
			// without reading every profile, and so a lineup stays explicable
			// after the ratings behind it have moved on.
			elos: Object.fromEntries(players.map(player => [player.uid, player.elo])),
			seed: getSeed(gameId, game.reshuffleCount ?? 0),
			settings,
			generation,
			builtAt: new Date().toISOString(),
		};

		await teamsRef.set(lineup);

		logger.info('Rebuilt teams', { seasonId, gameId, generation, teams: teams.length, playing: pool.length });
	}
);
