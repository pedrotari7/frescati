/**
 * Two players, and every game they have been in together.
 *
 * The numbers here are the ones the profile's "Played with" list already
 * shows, which is why the aggregate half is read straight off `getPlayerLinks`
 * rather than counted again: a row saying 4/7 and a screen opened from that row
 * disagreeing about 7 is the kind of thing the group notices immediately and
 * never trusts again. What this adds is the games behind those numbers, which
 * the list has nowhere to put.
 *
 * Read from one player's ledger, so the screen needs no query of its own: the
 * entries `usePlayerLedger` already fetches for a profile contain everybody who
 * played, which is what makes this cheap.
 */

import { getPlayerLinks } from './player';
import type { PlayerLink } from './player';
import type { RatingLedgerEntry } from './types';

/**
 * How one game went for this player, in the terms this pairing is about.
 *
 * On the same team it is whether *their* team finished top, so the two share
 * the answer. On opposite teams it is whether this player finished above the
 * other. Both map exactly onto the counters in `PlayerLink`, which is the point:
 * `wonTogether`, `beat`, `drewWith` and `lostTo` are these results tallied, so
 * a list of games that disagreed with the summary above it would be a bug in
 * one of them.
 *
 * `drew` only ever comes from opposite teams. A shared team cannot draw with
 * itself, and a tie for top is a win for everybody on it, which is how the
 * season table counts one.
 */
export type HeadToHeadResult = 'won' | 'drew' | 'lost';

export interface HeadToHeadGame {
	seasonId: string;
	gameId: string;
	kickoff: string;
	kickoffMillis: number;
	/** The two were on the same team. */
	together: boolean;
	/** This player's team's 0-indexed finishing place. Shared on a tie. */
	position: number;
	/** The other player's. Equal to `position` on a shared team, by construction. */
	theirPosition: number;
	result: HeadToHeadResult;
}

export interface HeadToHead {
	/**
	 * The totals, or `null` where the two have never shared a rated game with a
	 * team map on it. Not zeroes: a pairing nobody can say anything about and a
	 * pairing that has played out 0-0 are different facts, and only one of them
	 * is worth drawing a table for.
	 */
	link: PlayerLink | null;
	/** Newest first. A screen is read from the top and the last game is the one being argued about. */
	games: HeadToHeadGame[];
}

const resultOf = (together: boolean, position: number, theirPosition: number): HeadToHeadResult => {
	// A shared team's result is its finishing place, which both of them take.
	if (together) return position === 0 ? 'won' : 'lost';

	if (position < theirPosition) return 'won';

	return position === theirPosition ? 'drew' : 'lost';
};

/**
 * Every game these two both appeared in, and what it settled.
 *
 * Entries with no `teams` map are skipped rather than guessed at, for the
 * reason `getPlayerLinks` skips them: the missing field is the only thing that
 * separates a teammate from an opponent, and a game read the wrong way round
 * here is worse than a game left out. `backfill-ledger-teams` is the repair.
 */
export const getHeadToHead = (entries: RatingLedgerEntry[], uid: string, otherUid: string): HeadToHead => {
	const games: HeadToHeadGame[] = [];

	for (const entry of entries) {
		const teams = entry.teams;
		const team = teams?.[uid];
		const theirTeam = teams?.[otherUid];
		const position = entry.positions?.[uid];
		const theirPosition = entry.positions?.[otherUid];

		if (team === undefined || theirTeam === undefined || position === undefined || theirPosition === undefined) {
			continue;
		}

		const together = team === theirTeam;

		games.push({
			seasonId: entry.seasonId,
			gameId: entry.gameId,
			kickoff: entry.kickoff,
			kickoffMillis: entry.kickoffMillis,
			together,
			position,
			theirPosition,
			result: resultOf(together, position, theirPosition),
		});
	}

	// Newest first, and the game id after it so two games kicking off at once
	// draw the same way on every device rather than however the query returned.
	games.sort((a, b) => b.kickoffMillis - a.kickoffMillis || (a.gameId < b.gameId ? -1 : 1));

	return { link: getPlayerLinks(entries, uid).find(link => link.uid === otherUid) ?? null, games };
};

/**
 * The current run of games that went the same way for this player.
 *
 * Counted over opposite-team games only, because a run is an argument about
 * which of the two is on top and a night on the same team settles nothing
 * either way. Zero where the last such game was a draw, which is a run of
 * neither rather than a run of nothing.
 */
export const getHeadToHeadRun = (games: HeadToHeadGame[]): { result: HeadToHeadResult; count: number } | null => {
	const meetings = games.filter(game => !game.together);
	const latest = meetings[0];

	if (!latest || latest.result === 'drew') return null;

	let count = 0;
	for (const game of meetings) {
		if (game.result !== latest.result) break;
		count++;
	}

	return { result: latest.result, count };
};
