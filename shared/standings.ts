/**
 * The table.
 *
 * Built from whichever matches have actually been played, which is the whole
 * difficulty: rain stops play, somebody has to leave, and a game that got
 * through four of its six matches still has to produce a fair order.
 *
 * The trick is to rank on **per-match rates** rather than totals. When every
 * team has played the same number — the ordinary case — dividing by a constant
 * changes nothing, so this collapses to plain points. When they haven't, it is
 * the only ranking that doesn't reward whoever happened to get an extra game.
 */

import type { TeamStanding, TournamentMatch } from './types';

const WIN_POINTS = 3;
const DRAW_POINTS = 1;

/** Points from one scoreline, for the first and second team in that order. */
export const getMatchPoints = (scoreA: number, scoreB: number): [number, number] => {
	if (scoreA > scoreB) return [WIN_POINTS, 0];
	if (scoreA < scoreB) return [0, WIN_POINTS];

	return [DRAW_POINTS, DRAW_POINTS];
};

const emptyRow = (team: number): TeamStanding => ({
	team,
	played: 0,
	won: 0,
	drawn: 0,
	lost: 0,
	goalsFor: 0,
	goalsAgainst: 0,
	goalDifference: 0,
	points: 0,
	position: 0,
});

/** Raw totals, before anything is ranked. */
const tally = (teamCount: number, matches: TournamentMatch[]): TeamStanding[] => {
	const rows = Array.from({ length: teamCount }, (_, team) => emptyRow(team));

	for (const match of matches) {
		const [rowA, rowB] = [rows[match.teamA], rows[match.teamB]];

		// A match naming a team that no longer exists is left over from a lineup
		// rebuilt after it was scored. Ignore it rather than throw.
		if (!rowA || !rowB) continue;

		const [pointsA, pointsB] = getMatchPoints(match.scoreA, match.scoreB);

		for (const [row, own, against, points] of [
			[rowA, match.scoreA, match.scoreB, pointsA] as const,
			[rowB, match.scoreB, match.scoreA, pointsB] as const,
		]) {
			row.played++;
			row.goalsFor += own;
			row.goalsAgainst += against;
			row.goalDifference = row.goalsFor - row.goalsAgainst;
			row.points += points;

			if (points === WIN_POINTS) row.won++;
			else if (points === DRAW_POINTS) row.drawn++;
			else row.lost++;
		}
	}

	return rows;
};

/** Per match, so an unequal number of games doesn't distort the order. */
const perMatch = (total: number, played: number): number => (played === 0 ? 0 : total / played);

/**
 * Points and goal difference counting only the matches played *between* the
 * given teams. This is what "the tie-break is the result between them" means,
 * and with three or more level it is a mini-table rather than a single game.
 */
const headToHead = (teams: number[], matches: TournamentMatch[]): Map<number, { points: number; diff: number }> => {
	const tied = new Set(teams);
	const table = new Map(teams.map(team => [team, { points: 0, diff: 0 }]));

	for (const match of matches) {
		if (!tied.has(match.teamA) || !tied.has(match.teamB)) continue;

		const [pointsA, pointsB] = getMatchPoints(match.scoreA, match.scoreB);

		table.get(match.teamA)!.points += pointsA;
		table.get(match.teamA)!.diff += match.scoreA - match.scoreB;
		table.get(match.teamB)!.points += pointsB;
		table.get(match.teamB)!.diff += match.scoreB - match.scoreA;
	}

	return table;
};

/**
 * The keys that separate two teams already level on points, in order: the
 * mini-table between them first, then overall goal difference, then goals
 * scored. Higher wins on every one.
 */
const tieBreakKeys = (row: TeamStanding, h2h: Map<number, { points: number; diff: number }>): number[] => [
	h2h.get(row.team)?.points ?? 0,
	h2h.get(row.team)?.diff ?? 0,
	perMatch(row.goalDifference, row.played),
	perMatch(row.goalsFor, row.played),
];

/** Negative when `a` finishes above `b`, zero when nothing separates them. */
const compareKeys = (a: number[], b: number[]): number => {
	for (let key = 0; key < a.length; key++) {
		if (a[key] !== b[key]) return b[key] - a[key];
	}

	return 0;
};

const sameKeys = (a: number[], b: number[]): boolean => compareKeys(a, b) === 0;

/**
 * The table, ordered and with positions assigned.
 *
 * Teams level on every key share a position. That is deliberate rather than
 * lazy: the rating splits the places a tie covers between them, so nothing
 * downstream needs a winner the football didn't produce.
 */
export const getStandings = (teamCount: number, matches: TournamentMatch[]): TeamStanding[] => {
	// Grouped by the primary key first, because head-to-head is only meaningful
	// among teams that are actually level on it.
	const byPoints = new Map<number, TeamStanding[]>();

	for (const row of tally(teamCount, matches)) {
		const key = perMatch(row.points, row.played);
		byPoints.set(key, [...(byPoints.get(key) ?? []), row]);
	}

	const ordered = [...byPoints.entries()]
		.sort(([a], [b]) => b - a)
		.flatMap(([points, group]) => {
			const h2h = headToHead(
				group.map(row => row.team),
				matches
			);

			return group
				.map(row => ({ row, points, keys: tieBreakKeys(row, h2h) }))
				.sort(
					(a, b) =>
						compareKeys(a.keys, b.keys) ||
						// Genuinely inseparable. Ordered by team index so the
						// table is stable across devices; they share a position
						// either way.
						a.row.team - b.row.team
				);
		});

	let position = 0;

	return ordered.map((entry, index) => {
		const previous = ordered[index - 1];

		// Keys are only comparable inside a points group — head-to-head differs
		// between them — so both checks are needed to call two rows level.
		if (previous && !(previous.points === entry.points && sameKeys(previous.keys, entry.keys))) {
			position = index;
		}

		return { ...entry.row, position };
	});
};

/** Positions in team order, which is the shape `getRatingChanges` wants. */
export const getPositions = (standings: TeamStanding[]): number[] =>
	[...standings].sort((a, b) => a.team - b.team).map(row => row.position);
