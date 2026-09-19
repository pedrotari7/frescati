/**
 * The two order statistics a report is read off.
 *
 * Here rather than beside a caller because both are pure, both are the sort of
 * thing that breaks quietly, and both had been written twice: the rating replay
 * report carried its own pair, sorting the same array in two functions three
 * lines apart.
 *
 * An empty set answers `0` rather than nothing. Both callers are printing a
 * column of numbers beside a count that already says how many observations
 * there were, and a dash in the middle of that column is harder to read than a
 * zero that the count next to it explains.
 */

/** A sorted copy. The input is left alone, since every caller reuses it. */
const ascending = (values: number[]): number[] => [...values].sort((a, b) => a - b);

/**
 * The middle, averaging the two middles on an even count.
 *
 * The median rather than the mean wherever this is used, because one freakish
 * evening or one cold cache moves a mean, and the question being asked is what
 * an ordinary one looks like.
 */
export const median = (values: number[]): number => {
	if (values.length === 0) return 0;

	const sorted = ascending(values);
	const half = sorted.length / 2;

	return Number.isInteger(half) ? (sorted[half - 1] + sorted[half]) / 2 : sorted[Math.floor(half)];
};

/**
 * The value a given fraction of the way up, by nearest rank rather than by
 * interpolating between the two either side of it.
 *
 * A p90 that is a number nobody ever saw invites the argument about which game
 * it was, so this always answers with a real observation.
 */
export const percentile = (values: number[], fraction: number): number => {
	if (values.length === 0) return 0;

	const sorted = ascending(values);

	return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
};
