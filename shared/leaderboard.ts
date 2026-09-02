/**
 * The two ladders.
 *
 * The all-time one is just the profiles sorted, because a rating is already
 * global and carried across every season. The season one is aggregated from the
 * rating ledger, which is the only record of who actually played and where they
 * finished. A response says who *meant* to play, and on the day those differ.
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
 * Somebody an admin gave a starting point to has a real rating, since the
 * balancer uses it from their first game, but they have played nothing, and
 * putting an estimate on the ladder above people who earned their place is
 * the same mistake in a more flattering shape.
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

/**
 * Games in a form guide. Enough to show a run, short enough to scan on a phone.
 *
 * Shared with the career screen, which draws the same idea in a bigger box.
 * Two screens disagreeing about how long "recent" is would make one of them
 * wrong about a run the other showed.
 */
export const FORM_LENGTH = 5;

/** One game in a form guide, as the ledger recorded it. */
export interface SeasonResult {
	gameId: string;
	kickoff: string;
	/** Their team's 0-indexed finishing place. Shared on a tie. */
	position: number;
	/** Their team finished top, the same test `wins` counts. */
	won: boolean;
}

export interface SeasonRow {
	uid: string;
	/** Games actually played, as recorded when each was confirmed. */
	appearances: number;
	/** Games their team finished top, shared firsts included. */
	wins: number;
	/** Rating gained or lost across the season, in Elo. */
	movement: number;
	/** Their last `FORM_LENGTH` games this season, oldest first. */
	form: SeasonResult[];
	position: number;
}

/** Which of a row's three numbers the season table is ordered on. */
export type SeasonSort = 'won' | 'rating' | 'played';

/**
 * What each sort compares, most significant first, all of them bigger first.
 *
 * All three fall through to the other columns rather than stopping at the one
 * they are named after. A season is a handful of games, so a column on its own
 * is mostly ties: three games in, everybody has played one, two or three, and
 * `played` alone would draw those three numbers with an arbitrary order inside
 * each of them and call it a table.
 */
const SEASON_SORT_KEYS: Record<SeasonSort, (row: SeasonRow) => number[]> = {
	won: row => [row.wins, row.movement],
	rating: row => [row.movement, row.wins],
	played: row => [row.appearances, row.wins, row.movement],
};

/** Bigger first, key by key. Zero only when the rows genuinely tie. */
const compareSeasonRows = (sort: SeasonSort, a: SeasonRow, b: SeasonRow): number => {
	const keys = SEASON_SORT_KEYS[sort];
	const [left, right] = [keys(a), keys(b)];

	for (let index = 0; index < left.length; index++) {
		if (left[index] !== right[index]) return right[index] - left[index];
	}

	return 0;
};

/**
 * The season table, from that season's ledger entries.
 *
 * Ordered on games won by default, then rating movement, deliberately not on
 * rating itself. The all-time ladder already answers "who is best"; this one
 * answers "who had a good season", and somebody who turned up every week and
 * kept winning belongs at the top of it even if they started strong.
 *
 * `sort` swaps which of the three numbers leads, because that default is an
 * opinion and not everybody shares it. Wins put the player who turned up six
 * times and won three above the one who turned up once and won it. That is the
 * point of the column, and it is also the thing somebody hunting for the in-form
 * player is arguing with. The other two orders are the same rows read a
 * different way round, never a different set of rows.
 *
 * Which is also why each row carries its last few results: the order says how
 * the season went overall and says nothing about where it is going, and the
 * player two places below who has won the last four is the more interesting
 * fact on the screen.
 */
export const getSeasonTable = (
	entries: RatingLedgerEntry[],
	seasonId: string,
	sort: SeasonSort = 'won'
): SeasonRow[] => {
	const rows = new Map<string, SeasonRow>();

	// Kickoff order, and the game id after it so two games kicking off at once
	// draw the same way on every device. The totals below would come out the
	// same in any order. The form guide is what needs this, and the query that
	// fetches these entries doesn't sort them.
	const played = entries
		.filter(entry => entry.seasonId === seasonId)
		.sort((a, b) => a.kickoffMillis - b.kickoffMillis || (a.gameId < b.gameId ? -1 : 1));

	for (const entry of played) {
		for (const [uid, position] of Object.entries(entry.positions ?? {})) {
			const row = rows.get(uid) ?? { uid, appearances: 0, wins: 0, movement: 0, form: [], position: 0 };
			const after = entry.after[uid]?.elo;

			row.appearances++;
			if (position === 0) row.wins++;

			// Trimmed as it goes rather than collected and sliced, so a season
			// twice this long doesn't carry a result per player per game into a
			// row that shows five.
			row.form.push({ gameId: entry.gameId, kickoff: entry.kickoff, position, won: position === 0 });
			if (row.form.length > FORM_LENGTH) row.form.shift();

			// Somebody who arrived unrated moved from the seed the game rated
			// them off, which `seedElo` records, so a first appearance counts
			// exactly what the team sheet showed them, rather than leaving a
			// player on nothing while their teammates show the same result as a
			// loss. Falls back to no movement on an entry written before the
			// seed was stored, where the distance really is unrecoverable.
			if (after !== undefined) row.movement += after - (entry.before[uid]?.elo ?? entry.seedElo ?? after);

			rows.set(uid, row);
		}
	}

	const ordered = [...rows.values()].sort((a, b) => compareSeasonRows(sort, a, b) || (a.uid < b.uid ? -1 : 1));

	let position = 0;

	return ordered.map((row, index) => {
		// Every key the sort compared, not just the column it is named after. Two
		// players level on wins but apart on movement are in a real, meaningful
		// order, not a tie, and the same goes for two level on appearances.
		if (index > 0 && compareSeasonRows(sort, ordered[index - 1], row) !== 0) position = index;

		return { ...row, position };
	});
};

/**
 * A season's rating movement on the displayed 0–100 scale, so it agrees with
 * the numbers beside it rather than quoting Elo nobody else ever sees.
 *
 * **The parts do not sum to the whole, and that is left alone.** A display point
 * is five Elo, and a season total rounds the sum while each game's badge rounds
 * that game, so two games worth 13.2 and 8.3 read `+3` and `+2` against a season
 * of `+4`. Every game can drift half a point, so a season of `n` games can be
 * `n / 2` out.
 *
 * The fix that suggests itself is to work in display space throughout,
 * `toDisplayRating(after) - toDisplayRating(before)`, which telescopes and
 * always adds up. It trades a worse complaint for this one: a squad shares a
 * single Elo delta but sits at different ratings, so teammates who moved
 * identically would read `+2` and `+3` on the same team card. Rounding an
 * honest number twice is the better of the two, and both screens say so in a
 * footnote.
 */
export const toDisplayMovement = (movement: number): number => toDisplayRating(BASE_ELO + movement) - 50;
