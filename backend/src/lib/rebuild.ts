import { logger } from 'firebase-functions';
import type { AppUser, BalanceSettings, Game, Season, TournamentTeams } from '../../../shared/types';
import { DEFAULT_BALANCE_SETTINGS } from '../../../shared/types';
import { isConfirmed } from '../../../shared/game';
import { getElo, getSeedElo } from '../../../shared/rating';
import { getSeed, pickTeams } from '../../../shared/optimizer';
import type { OptimizerPlayer } from '../../../shared/optimizer';
import { getSquadSizes, getTeamCount } from '../../../shared/tournament';
import { db } from './firebase';
import { getGame, getResponses, getSeason } from './data';

/**
 * Re-picking the teams for one game.
 *
 * Separated from the task handler that normally calls it so it can also be run
 * directly — which is what the emulator does, Cloud Tasks having none. Nothing
 * in here is incremental: the lineup is derived from the pool, the ratings and
 * a seed, so running it twice writes the same document twice and a retry is
 * always safe.
 */

export interface TeamRebuildTask {
	seasonId: string;
	gameId: string;
	/** The `Game.teamsGeneration` this rebuild was queued for. */
	generation: number;
}

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

	// `getAll` throws when handed nothing, which is exactly what the very first
	// game of a season produces — so without this the one night that has no
	// history to avoid repeating is the one night that never gets a lineup.
	if (games.empty) return [];

	const lineups = await db.getAll(...games.docs.map(game => game.ref.collection('tournament').doc('teams')));

	return lineups
		.filter(lineup => lineup.exists)
		.map(lineup => (lineup.data() as TournamentTeams).teams.map(team => team.uids));
};

export const runTeamRebuild = async ({ seasonId, gameId, generation }: TeamRebuildTask): Promise<void> => {
	const teamsRef = db.doc(`seasons/${seasonId}/games/${gameId}/tournament/teams`);

	const game = await getGame(seasonId, gameId);

	// The game went away between queueing and running — the cascade delete will
	// have taken the lineup with it.
	if (!game) return;

	// Once a night has been confirmed its lineup is no longer a suggestion: it
	// is what the ledger was computed against, and `replayRatingsFrom` reads it
	// back to recompute a correction. Re-picking it here would silently rewrite
	// what a past night meant, so a confirmed game's teams are frozen.
	if (game.resultFinalisedAt) {
		logger.debug('Left a confirmed night’s lineup alone', { seasonId, gameId });
		return;
	}

	// Somebody answered after this task was queued, so a later task is already
	// on its way with fresher data. Dropping out here is what turns a burst of
	// answers into a single rebuild.
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

	// Not enough for a tournament. Clear any lineup rather than leaving a stale
	// one up — people dropping out is exactly when a team sheet from an hour ago
	// becomes actively misleading.
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
		// Snapshotted so the screen can show what each player was rated without
		// reading every profile, and so a lineup stays explicable after the
		// ratings behind it have moved on.
		elos: Object.fromEntries(players.map(player => [player.uid, player.elo])),
		seed: getSeed(gameId, game.reshuffleCount ?? 0),
		settings,
		generation,
		builtAt: new Date().toISOString(),
	};

	await teamsRef.set(lineup);

	logger.info('Rebuilt teams', { seasonId, gameId, generation, teams: teams.length, playing: pool.length });
};
