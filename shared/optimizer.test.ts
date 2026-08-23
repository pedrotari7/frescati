import { pickTeams, getSeed } from './optimizer';
import type { OptimizerPlayer } from './optimizer';
import { getSquadSizes, getTeamCount } from './tournament';
import { DEFAULT_BALANCE_SETTINGS } from './types';
import type { BalanceSettings, TournamentTeam } from './types';

const settings = (overrides: Partial<BalanceSettings> = {}): BalanceSettings => ({
	...DEFAULT_BALANCE_SETTINGS,
	...overrides,
});

/** `count` players, evenly spaced in rating, so a perfect split always exists. */
const ladder = (count: number, step = 50): OptimizerPlayer[] =>
	Array.from({ length: count }, (_, index) => ({ uid: `p${index}`, elo: 1000 + index * step }));

const build = (
	players: OptimizerPlayer[],
	overrides: Partial<BalanceSettings> = {},
	seed = 1,
	history: string[][][] = []
) =>
	pickTeams({
		players,
		squadSizes: getSquadSizes(players.length, getTeamCount(players.length)),
		seed,
		settings: settings(overrides),
		history,
	});

const spread = (teams: TournamentTeam[], players: OptimizerPlayer[]): number => {
	const elos = new Map(players.map(player => [player.uid, player.elo]));
	const averages = teams.map(
		team => team.uids.reduce((total, uid) => total + (elos.get(uid) ?? 0), 0) / team.uids.length
	);

	return Math.max(...averages) - Math.min(...averages);
};

describe('getSeed', () => {
	it('is stable for the same game and reshuffle', () => {
		expect(getSeed('game-1', 0)).toBe(getSeed('game-1', 0));
	});

	it('changes when an admin reshuffles', () => {
		expect(getSeed('game-1', 0)).not.toBe(getSeed('game-1', 1));
	});

	it('differs between games, so no two roll identically', () => {
		expect(getSeed('game-1', 0)).not.toBe(getSeed('game-2', 0));
	});
});

describe('pickTeams', () => {
	it('seats everyone exactly once', () => {
		const players = ladder(13);
		const teams = build(players);
		const seated = teams.flatMap(team => team.uids);

		expect(seated).toHaveLength(13);
		expect(new Set(seated).size).toBe(13);
		expect([...seated].sort()).toEqual(players.map(player => player.uid).sort());
	});

	it('honours the squad sizes for every headcount that makes a tournament', () => {
		for (let playing = 8; playing <= 24; playing++) {
			const players = ladder(playing);
			const expected = getSquadSizes(playing, getTeamCount(playing));

			expect(build(players).map(team => team.uids.length)).toEqual(expected);
		}
	});

	it('has nothing to build below the floor', () => {
		expect(build(ladder(6))).toEqual([]);
	});

	it('returns the same teams for the same seed', () => {
		const players = ladder(16);

		expect(build(players, {}, 42)).toEqual(build(players, {}, 42));
	});

	it('does not depend on the order the players arrived in', () => {
		const players = ladder(14);
		const shuffledInput = [...players].reverse();

		expect(build(shuffledInput, {}, 7)).toEqual(build(players, {}, 7));
	});

	it('finds a perfectly even split when one exists', () => {
		const players = ladder(8);

		expect(spread(build(players, { randomness: 0, repeatPenalty: 0 }), players)).toBeCloseTo(0, 6);
	});

	it('keeps four teams close even when the ratings are far apart', () => {
		const players = ladder(16, 40);

		expect(spread(build(players, { randomness: 0, repeatPenalty: 0 }), players)).toBeLessThan(5);
	});

	it('stays within the tolerance of the flattest split when randomness is up', () => {
		const players = ladder(16, 40);
		const flattest = spread(build(players, { randomness: 0, repeatPenalty: 0 }), players);
		const loose = spread(build(players, { randomness: 1, repeatPenalty: 0 }), players);

		expect(loose).toBeLessThanOrEqual(flattest + 40);
	});

	it('splits up recent teammates when the repeat penalty is on', () => {
		// All the same rating, so balance can't decide anything and the repeat
		// penalty is the only thing left to optimise.
		const players = ['a', 'b', 'c', 'd'].map(uid => ({ uid, elo: 1000 }));
		const lastWeek = [
			[
				['a', 'b'],
				['c', 'd'],
			],
		];

		const teams = pickTeams({
			players,
			squadSizes: [2, 2],
			seed: 3,
			settings: settings({ randomness: 0, repeatPenalty: 1, repeatLookback: 4 }),
			history: lastWeek,
		});

		const together = teams.some(team => team.uids.includes('a') && team.uids.includes('b'));

		expect(together).toBe(false);
	});

	it('ignores history when the repeat penalty is off', () => {
		const players = ['a', 'b', 'c', 'd'].map(uid => ({ uid, elo: 1000 }));
		const lastWeek = [
			[
				['a', 'b'],
				['c', 'd'],
			],
		];

		const withHistory = pickTeams({
			players,
			squadSizes: [2, 2],
			seed: 3,
			settings: settings({ randomness: 0, repeatPenalty: 0 }),
			history: lastWeek,
		});

		const without = pickTeams({
			players,
			squadSizes: [2, 2],
			seed: 3,
			settings: settings({ randomness: 0, repeatPenalty: 0 }),
			history: [],
		});

		expect(withHistory).toEqual(without);
	});

	// `(lookback - age) / lookback` inverts sign for a non-positive lookback,
	// weighting older games *more* than recent ones instead of less. Guarded by
	// treating it the same as `repeatPenalty: 0`, history ignored entirely,
	// rather than acting on a nonsensical weighting.
	it('ignores history rather than inverting the weighting when the lookback is not positive', () => {
		const players = ['a', 'b', 'c', 'd'].map(uid => ({ uid, elo: 1000 }));
		const lastWeek = [
			[
				['a', 'b'],
				['c', 'd'],
			],
		];

		const negativeLookback = pickTeams({
			players,
			squadSizes: [2, 2],
			seed: 3,
			settings: settings({ randomness: 0, repeatPenalty: 1, repeatLookback: -4 }),
			history: lastWeek,
		});

		const penaltyOff = pickTeams({
			players,
			squadSizes: [2, 2],
			seed: 3,
			settings: settings({ randomness: 0, repeatPenalty: 0 }),
			history: lastWeek,
		});

		expect(negativeLookback).toEqual(penaltyOff);
	});

	it('lists each squad strongest first', () => {
		const players = ladder(12);
		const elos = new Map(players.map(player => [player.uid, player.elo]));

		for (const team of build(players)) {
			const teamElos = team.uids.map(uid => elos.get(uid)!);
			expect(teamElos).toEqual([...teamElos].sort((a, b) => b - a));
		}
	});

	it('numbers the teams from zero', () => {
		expect(build(ladder(16)).map(team => team.index)).toEqual([0, 1, 2, 3]);
	});
});
