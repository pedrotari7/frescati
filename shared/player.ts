/**
 * One player's career, read out of the rating ledger.
 *
 * The ledger is the only record of who actually *played* — a response says who
 * meant to, and on the day those differ — and every entry already carries what
 * each player took into the game, what they took out and where their team
 * finished. So a player screen is an aggregation, not a new collection: nothing
 * here needs storing, and nothing here can disagree with the ladder, because a
 * replay rewrites the same entries this reads.
 *
 * Deliberately says nothing about how many teams a game had. `positions` maps
 * players to their team's place, and a tie for last is indistinguishable from a
 * smaller field — so a place is shown as a place, never as "2nd of 4".
 */

import type { RatingLedgerEntry } from './types';

/** One game a player actually played, as the ledger recorded it. */
export interface PlayerGame {
	seasonId: string;
	gameId: string;
	kickoff: string;
	kickoffMillis: number;
	/** Their team's 0-indexed finishing place. Shared on a tie. */
	position: number;
	/** Their team finished top, shared firsts included — as the season table counts it. */
	won: boolean;
	/** The group voted them man of the match, shared on a tie. */
	motm: boolean;
	/** Elo carried in, `null` when they arrived with no rating at all. */
	before: number | null;
	/** Elo carried out. */
	after: number;
	/**
	 * What the game moved them, in Elo. Zero on a first appearance: somebody who
	 * carried no rating in had nothing to move, and measuring the distance from a
	 * seed nobody stored would credit them with a gain they never made — the same
	 * rule the season table applies.
	 */
	delta: number;
}

export interface PlayerRecord {
	/** Oldest first, which is the order the rating was built in. */
	games: PlayerGame[];
	appearances: number;
	wins: number;
	/** Games the group voted them man of the match. */
	motm: number;
	/** The longest run of consecutive wins. */
	bestRun: number;
	/** Wins at the end of the run — zero unless the last game was one. */
	currentRun: number;
	/** The highest Elo they have ever carried out of a game. */
	peak: number | null;
}

/**
 * Every rated game this player appeared in, oldest first.
 *
 * An entry missing them from either `positions` or `after` is skipped rather
 * than half-read: the first is what a ledger entry written before positions
 * existed looks like, and without both there is no way to say what the game did
 * to them.
 */
export const getPlayerGames = (entries: RatingLedgerEntry[], uid: string): PlayerGame[] =>
	entries
		.filter(entry => entry.positions?.[uid] !== undefined && entry.after?.[uid] !== undefined)
		.map(entry => {
			const before = entry.before?.[uid]?.elo ?? null;
			const after = entry.after[uid].elo;
			const position = entry.positions[uid];

			return {
				seasonId: entry.seasonId,
				gameId: entry.gameId,
				kickoff: entry.kickoff,
				kickoffMillis: entry.kickoffMillis,
				position,
				won: position === 0,
				// Absent on an entry written before the vote existed, and on one
				// confirmed while its own vote was still open. Neither is a game
				// they lost the vote in, but neither is one they won it in either,
				// so both read as false.
				motm: entry.motm?.includes(uid) ?? false,
				before,
				after,
				delta: before === null ? 0 : after - before,
			};
		})
		// Kickoff order, which is the order the ratings were applied in — and the
		// game id after it, so two games kicking off at once still draw the same
		// way on every device rather than however the query happened to return.
		.sort((a, b) => a.kickoffMillis - b.kickoffMillis || (a.gameId < b.gameId ? -1 : 1));

export const getPlayerRecord = (entries: RatingLedgerEntry[], uid: string): PlayerRecord => {
	const games = getPlayerGames(entries, uid);

	let bestRun = 0;
	let currentRun = 0;

	for (const game of games) {
		currentRun = game.won ? currentRun + 1 : 0;
		bestRun = Math.max(bestRun, currentRun);
	}

	return {
		games,
		appearances: games.length,
		wins: games.filter(game => game.won).length,
		motm: games.filter(game => game.motm).length,
		bestRun,
		currentRun,
		peak: games.length === 0 ? null : Math.max(...games.map(game => game.after)),
	};
};

/**
 * The rating as it stood after each game, with the rating they started on in
 * front of it.
 *
 * That leading point is what makes the first game visible as a movement rather
 * than as the flat start of the line — except for somebody who arrived unrated,
 * who genuinely had no rating before it and whose line therefore starts where
 * their first game left them.
 */
export const getRatingTrend = (games: PlayerGame[]): number[] => {
	if (games.length === 0) return [];

	const opening = games[0].before;

	return [...(opening === null ? [] : [opening]), ...games.map(game => game.after)];
};
