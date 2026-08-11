/**
 * The two ladders.
 *
 * The all-time one is just the profiles sorted, because a rating is already
 * global and carried across every season. The season one is aggregated from the
 * rating ledger, which is the only record of who actually played and where they
 * finished — a response says who *meant* to play, and on the day those differ.
 */

import type { AppUser, RatingLedgerEntry } from './types';
import { BASE_ELO, hasPlayed, isProvisional, toDisplayRating } from './rating';

export interface LadderRow {
	uid: string;
	elo: number;
	games: number;
	provisional: boolean;
	/** 0-indexed, shared on an exact tie. */
	position: number;
}

/**
 * Everyone who has ever been rated, best first.
 *
 * Unrated players are left off rather than shown at the base rating: they have
 * not earned a place on a ladder, and seeding them at 50 would bury genuinely
 * average players beneath a wall of people who have never played.
 *
 * Which is why this asks `hasPlayed` rather than whether a rating is stored.
 * Somebody an admin gave a starting point to has a real rating — the balancer
 * uses it from their first game — but they have played nothing, and putting an
 * estimate on the ladder above people who earned their place is the same
 * mistake in a more flattering shape.
 */
export const getRatingLadder = (users: AppUser[]): LadderRow[] => {
	const rated = users
		.filter(user => hasPlayed(user.rating))
		.map(user => ({
			uid: user.uid,
			elo: user.rating!.elo,
			games: user.rating!.games,
			provisional: isProvisional(user.rating),
			position: 0,
		}))
		.sort((a, b) => b.elo - a.elo || (a.uid < b.uid ? -1 : 1));

	let position = 0;

	return rated.map((row, index) => {
		if (index > 0 && rated[index - 1].elo !== row.elo) position = index;

		return { ...row, position };
	});
};

export interface SeasonRow {
	uid: string;
	/** Games actually played, as recorded when each was confirmed. */
	appearances: number;
	/** Games their team finished top, shared firsts included. */
	wins: number;
	/** Rating gained or lost across the season, in Elo. */
	movement: number;
	position: number;
}

/**
 * The season table, from that season's ledger entries.
 *
 * Ordered on games won, then rating movement — deliberately not on rating
 * itself. The all-time ladder already answers "who is best"; this one answers
 * "who had a good season", and somebody who turned up every week and kept
 * winning belongs at the top of it even if they started strong.
 */
export const getSeasonTable = (entries: RatingLedgerEntry[], seasonId: string): SeasonRow[] => {
	const rows = new Map<string, SeasonRow>();

	for (const entry of entries) {
		if (entry.seasonId !== seasonId) continue;

		for (const [uid, position] of Object.entries(entry.positions ?? {})) {
			const row = rows.get(uid) ?? { uid, appearances: 0, wins: 0, movement: 0, position: 0 };
			const after = entry.after[uid]?.elo;

			row.appearances++;
			if (position === 0) row.wins++;

			// A player with no rating before the game had nothing to move, so
			// their first appearance contributes nothing rather than counting
			// the whole distance from a seed nobody stored.
			if (after !== undefined) row.movement += after - (entry.before[uid]?.elo ?? after);

			rows.set(uid, row);
		}
	}

	const ordered = [...rows.values()].sort(
		(a, b) => b.wins - a.wins || b.movement - a.movement || (a.uid < b.uid ? -1 : 1)
	);

	let position = 0;

	return ordered.map((row, index) => {
		const previous = ordered[index - 1];
		// Both sort keys, not just wins — two players level on wins but apart on
		// movement are in a real, meaningful order, not a tie.
		if (index > 0 && (previous.wins !== row.wins || previous.movement !== row.movement)) position = index;

		return { ...row, position };
	});
};

/**
 * A season's rating movement on the displayed 0–100 scale, so it agrees with
 * the numbers beside it rather than quoting Elo nobody else ever sees.
 */
export const toDisplayMovement = (movement: number): number => toDisplayRating(BASE_ELO + movement) - 50;
