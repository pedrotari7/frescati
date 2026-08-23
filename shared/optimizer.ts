/**
 * Team selection.
 *
 * Given who's playing and what they're rated, split them into squads that are
 * as even as possible without producing the same teams every single week.
 *
 * Pure and deterministic: the same players, seed and settings always yield the
 * same teams. That matters because the Cloud Function is the only thing allowed
 * to write a lineup, but the client runs this too, for an instant preview, and
 * so a lineup can be explained without a round trip. If the two ever disagreed,
 * the screen would lie.
 */

import type { BalanceSettings, TournamentTeam } from './types';

/** Elo of imbalance one recent repeat pairing is considered worth. */
const REPEAT_COST_ELO = 12;

/**
 * How far above the flattest split we'll wander at `randomness: 1`, in Elo of
 * team-average spread. Small on purpose. This exists to stop the same four
 * players finding each other every week, not to hand out unfair teams.
 */
const RANDOMNESS_TOLERANCE_ELO = 40;

/** Independent shuffles to hill-climb from. Cheap at these squad sizes. */
const RESTARTS = 60;

export interface OptimizerPlayer {
	uid: string;
	elo: number;
}

export interface OptimizerInput {
	players: OptimizerPlayer[];
	/** From `getSquadSizes`. Must total `players.length`. */
	squadSizes: number[];
	seed: number;
	settings: BalanceSettings;
	/** Previous games' squads, most recent game first. */
	history: string[][][];
}

/**
 * Mulberry32. A named, inlined generator rather than `Math.random` because the
 * whole point is reproducibility. Two devices must roll the same teams.
 */
const createRng = (seed: number): (() => number) => {
	let state = seed >>> 0;

	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

/**
 * A seed from the game and how many times an admin has hit Reshuffle. Derived
 * rather than stored so it survives a rebuild, and so the same game re-rolls
 * identically until somebody asks for a different roll.
 */
export const getSeed = (gameId: string, reshuffleCount = 0): number => {
	let hash = 2166136261;

	for (const character of `${gameId}:${reshuffleCount}`) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}

	return hash >>> 0;
};

/**
 * How often each pair of players has been on the same team lately, weighted so
 * last week counts for more than a month ago.
 *
 * Keyed on both orderings so lookups don't have to care which uid came first.
 */
const buildRepeatWeights = (history: string[][][], lookback: number): Map<string, number> => {
	const weights = new Map<string, number>();

	// A non-positive lookback has nothing sensible to weight by, since `(lookback -
	// age) / lookback` would flip sign and make older games count for more than
	// recent ones. Rules only bound this as a number, not its sign, so this is
	// the layer that has to hold the line: treat it the same as `repeatPenalty:
	// 0` already does, as "ignore history entirely".
	if (lookback <= 0) return weights;

	history.slice(0, lookback).forEach((game, age) => {
		const weight = (lookback - age) / lookback;

		for (const squad of game) {
			for (let i = 0; i < squad.length; i++) {
				for (let j = i + 1; j < squad.length; j++) {
					for (const key of [`${squad[i]}|${squad[j]}`, `${squad[j]}|${squad[i]}`]) {
						weights.set(key, (weights.get(key) ?? 0) + weight);
					}
				}
			}
		}
	});

	return weights;
};

/** The spread of team average ratings, in Elo. Zero is a perfect split. */
const getBalanceSpread = (squads: OptimizerPlayer[][]): number => {
	const averages = squads.map(squad =>
		squad.length === 0 ? 0 : squad.reduce((total, player) => total + player.elo, 0) / squad.length
	);

	return Math.max(...averages) - Math.min(...averages);
};

const getRepeatScore = (squads: OptimizerPlayer[][], weights: Map<string, number>): number => {
	if (weights.size === 0) return 0;

	let score = 0;

	for (const squad of squads) {
		for (let i = 0; i < squad.length; i++) {
			for (let j = i + 1; j < squad.length; j++) {
				score += weights.get(`${squad[i].uid}|${squad[j].uid}`) ?? 0;
			}
		}
	}

	return score;
};

const getCost = (squads: OptimizerPlayer[][], weights: Map<string, number>, repeatPenalty: number): number =>
	getBalanceSpread(squads) + repeatPenalty * REPEAT_COST_ELO * getRepeatScore(squads, weights);

/** Fisher–Yates against the seeded generator. */
const shuffled = <T>(items: T[], rng: () => number): T[] => {
	const copy = [...items];

	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}

	return copy;
};

const deal = (players: OptimizerPlayer[], squadSizes: number[]): OptimizerPlayer[][] => {
	const squads: OptimizerPlayer[][] = [];
	let cursor = 0;

	for (const size of squadSizes) {
		squads.push(players.slice(cursor, cursor + size));
		cursor += size;
	}

	return squads;
};

/**
 * Steepest-descent swapping: repeatedly take the single best swap available
 * between two squads, until nothing improves.
 *
 * Only swaps, never moves. Squad sizes are fixed by the headcount and must
 * stay that way.
 */
const improve = (squads: OptimizerPlayer[][], weights: Map<string, number>, repeatPenalty: number): number => {
	let cost = getCost(squads, weights, repeatPenalty);

	for (;;) {
		let best: { a: number; ai: number; b: number; bi: number; cost: number } | null = null;

		for (let a = 0; a < squads.length; a++) {
			for (let b = a + 1; b < squads.length; b++) {
				for (let ai = 0; ai < squads[a].length; ai++) {
					for (let bi = 0; bi < squads[b].length; bi++) {
						[squads[a][ai], squads[b][bi]] = [squads[b][bi], squads[a][ai]];
						const candidate = getCost(squads, weights, repeatPenalty);
						[squads[a][ai], squads[b][bi]] = [squads[b][bi], squads[a][ai]];

						if (candidate < cost - 1e-9 && (!best || candidate < best.cost)) {
							best = { a, ai, b, bi, cost: candidate };
						}
					}
				}
			}
		}

		if (!best) return cost;

		[squads[best.a][best.ai], squads[best.b][best.bi]] = [squads[best.b][best.bi], squads[best.a][best.ai]];
		cost = best.cost;
	}
};

/**
 * Split the pool into squads.
 *
 * Runs many independent hill climbs and then, rather than always returning the
 * flattest one, picks at random among those close enough to it, how close
 * being the `randomness` lever. At 0 this is a pure optimizer and the same
 * eleven players get the same teams forever; turning it up buys variety for a
 * few Elo of imbalance nobody can feel.
 */
export const pickTeams = ({ players, squadSizes, seed, settings, history }: OptimizerInput): TournamentTeam[] => {
	if (squadSizes.length === 0) return [];

	// Sort first so the result never depends on what order Firestore handed the
	// responses back in.
	const pool = [...players].sort((a, b) => (a.uid < b.uid ? -1 : 1));
	const rng = createRng(seed);
	const weights = buildRepeatWeights(history, settings.repeatLookback);

	const candidates = Array.from({ length: RESTARTS }, () => {
		const squads = deal(shuffled(pool, rng), squadSizes);

		return { squads, cost: improve(squads, weights, settings.repeatPenalty) };
	}).sort((a, b) => a.cost - b.cost);

	const tolerance = Math.max(0, Math.min(1, settings.randomness)) * RANDOMNESS_TOLERANCE_ELO;
	const acceptable = candidates.filter(candidate => candidate.cost <= candidates[0].cost + tolerance);
	const chosen = acceptable[Math.floor(rng() * acceptable.length)] ?? candidates[0];

	return chosen.squads.map((squad, index) => ({
		index,
		// Strongest first: the squad list doubles as a team sheet, and people
		// look for themselves relative to who else is on it.
		uids: [...squad].sort((a, b) => b.elo - a.elo || (a.uid < b.uid ? -1 : 1)).map(player => player.uid),
	}));
};
