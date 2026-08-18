import { logger } from 'firebase-functions';
import type { BalanceSettings, Game, Season, TournamentTeams } from '../../../shared/types';
import { DEFAULT_BALANCE_SETTINGS } from '../../../shared/types';
import { isConfirmed } from '../../../shared/game';
import { getElo, getSeedElo } from '../../../shared/rating';
import { getSeed, pickTeams } from '../../../shared/optimizer';
import type { OptimizerPlayer } from '../../../shared/optimizer';
import { getSquadSizes, getTeamCount } from '../../../shared/tournament';
import { db } from './firebase';
import { getGame, getProfiles, getResponses, getSeason } from './data';

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
	/**
	 * Re-pick even a lineup an admin has edited by hand.
	 *
	 * Set only by the one thing that means "re-pick these teams" outright —
	 * Reshuffle, and moving the balance levers, both of which `onGameWrite`
	 * sees. Every other rebuild is a side effect of somebody answering, and
	 * those must not quietly undo a hand-picked sheet.
	 */
	force?: boolean;
}

/** The levers actually in force: season defaults, overridden per game. */
const resolveSettings = (season: Season, game: Game): BalanceSettings => ({
	...DEFAULT_BALANCE_SETTINGS,
	...season.balance,
	...game.balance,
});

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
	// game of a season produces — so without this the one game that has no
	// history to avoid repeating is the one game that never gets a lineup.
	if (games.empty) return [];

	const lineups = await db.getAll(...games.docs.map(game => game.ref.collection('tournament').doc('teams')));

	return lineups
		.filter(lineup => lineup.exists)
		.map(lineup => (lineup.data() as TournamentTeams).teams.map(team => team.uids));
};

export const runTeamRebuild = async ({ seasonId, gameId, generation, force }: TeamRebuildTask): Promise<void> => {
	const teamsRef = db.doc(`seasons/${seasonId}/games/${gameId}/tournament/teams`);

	const game = await getGame(seasonId, gameId);

	// The game went away between queueing and running — the cascade delete will
	// have taken the lineup with it.
	if (!game) return;

	// Once a game has been confirmed its lineup is no longer a suggestion: it
	// is what the ledger was computed against, and `replayRatingsFrom` reads it
	// back to recompute a correction. Re-picking it here would silently rewrite
	// what a past game meant, so a confirmed game's teams are frozen.
	if (game.resultFinalisedAt) {
		logger.debug('Left a confirmed game’s lineup alone', { seasonId, gameId });
		return;
	}

	// Somebody answered after this task was queued, so a later task is already
	// on its way with fresher data. Dropping out here is what turns a burst of
	// answers into a single rebuild.
	if ((game.teamsGeneration ?? 0) !== generation) {
		logger.debug('Skipped a superseded team rebuild', { seasonId, gameId, generation });
		return;
	}

	// An admin has moved people about by hand. From then on this sheet is a
	// decision rather than a suggestion, and re-picking it because somebody
	// three streets away changed their mind would undo the evening's planning
	// with nothing on screen to say why — the same reasoning that freezes a
	// confirmed game's lineup, one step earlier.
	//
	// Read rather than assumed, so the pin costs one document read on a path
	// that is about to write that document anyway. `force` is the way back: it
	// carries an admin explicitly asking for a re-pick, which is the one
	// instruction that outranks their own earlier one.
	if (!force) {
		const existing = (await teamsRef.get()).data() as TournamentTeams | undefined;

		if (existing?.edited) {
			logger.debug('Left a hand-picked lineup alone', { seasonId, gameId, generation });
			return;
		}
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

	// Everyone whose rating matters here: the pool being picked, plus the season
	// roster. The roster is needed even for members sitting this one out, because
	// the seed for an unrated player is the average of the *season*, not of the
	// eleven people who happened to say yes.
	const users = await getProfiles([...new Set([...season.memberUids, ...pool.map(response => response.uid)])]);

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
