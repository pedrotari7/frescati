import {
	applyRatingChange,
	BASE_ELO,
	createStartingRating,
	fromDisplayRating,
	getActualWins,
	getExpectedWins,
	getRatingChanges,
	getSeedElo,
	getWinProbability,
	hasPlayed,
	isProvisional,
	PROVISIONAL_GAMES,
	toDisplayRating,
} from './rating';
import type { PlayerRating } from './types';

const rated = (elo: number, games = PROVISIONAL_GAMES): PlayerRating => ({
	elo,
	games,
	updatedAt: '2026-08-01T00:00:00.000Z',
});

/** `count` settled players on the same rating, all on `team`. */
const squad = (team: number, elo: number, count: number, prefix: string) =>
	Array.from({ length: count }, (_, index) => ({
		uid: `${prefix}-${index}`,
		rating: rated(elo),
		team,
	}));

const sum = (numbers: number[]) => numbers.reduce((total, value) => total + value, 0);

describe('toDisplayRating', () => {
	it('puts the base rating in the middle', () => {
		expect(toDisplayRating(BASE_ELO)).toBe(50);
	});

	it('spans the scale symmetrically', () => {
		expect(toDisplayRating(BASE_ELO + 250)).toBe(100);
		expect(toDisplayRating(BASE_ELO - 250)).toBe(0);
	});

	it('clamps the display without the caller losing the stored value', () => {
		expect(toDisplayRating(BASE_ELO + 900)).toBe(100);
		expect(toDisplayRating(BASE_ELO - 900)).toBe(0);
	});
});

describe('fromDisplayRating', () => {
	it('round-trips every number an admin can type', () => {
		for (let display = 0; display <= 100; display++) {
			expect(toDisplayRating(fromDisplayRating(display))).toBe(display);
		}
	});

	it('puts the middle of the scale on the base rating', () => {
		expect(fromDisplayRating(50)).toBe(BASE_ELO);
	});

	// The display clamps, so there is no Elo to recover from a number past the
	// ends of the scale. Refusing one is the callable's job; this just doesn't
	// invent a rating nobody could ever reach by playing.
	it('clamps rather than extrapolating past the scale', () => {
		expect(fromDisplayRating(140)).toBe(fromDisplayRating(100));
		expect(fromDisplayRating(-40)).toBe(fromDisplayRating(0));
	});
});

describe('hasPlayed', () => {
	it('is false for a player with no rating at all', () => {
		expect(hasPlayed(undefined)).toBe(false);
	});

	// The distinction the whole starting-rating feature turns on: a real stored
	// rating that nobody earned.
	it('is false for a starting rating an admin set', () => {
		expect(hasPlayed(createStartingRating(1200, '2026-08-01T00:00:00.000Z'))).toBe(false);
	});

	it('is true once a single game has been rated', () => {
		expect(hasPlayed(rated(BASE_ELO, 1))).toBe(true);
	});
});

describe('createStartingRating', () => {
	it('stores the rating with no games behind it', () => {
		expect(createStartingRating(1150, '2026-08-01T00:00:00.000Z')).toEqual({
			elo: 1150,
			games: 0,
			updatedAt: '2026-08-01T00:00:00.000Z',
		});
	});

	// It is an opening bid, so the first few games have to be able to move it.
	it('leaves the player provisional', () => {
		expect(isProvisional(createStartingRating(1150, '2026-08-01T00:00:00.000Z'))).toBe(true);
	});
});

describe('getSeedElo', () => {
	it('falls back to the base for a group with no history', () => {
		expect(getSeedElo([])).toBe(BASE_ELO);
	});

	it('seeds a newcomer at the group average rather than the base', () => {
		expect(getSeedElo([1100, 1200, 1300])).toBe(1200);
	});
});

describe('isProvisional', () => {
	it('treats an unrated player as provisional', () => {
		expect(isProvisional(undefined)).toBe(true);
	});

	it('settles once the games are in', () => {
		expect(isProvisional(rated(BASE_ELO, PROVISIONAL_GAMES - 1))).toBe(true);
		expect(isProvisional(rated(BASE_ELO, PROVISIONAL_GAMES))).toBe(false);
	});
});

describe('getWinProbability', () => {
	it('is a coin flip between equals', () => {
		expect(getWinProbability(BASE_ELO, BASE_ELO)).toBe(0.5);
	});

	it('makes a 400-point gap roughly ten to one', () => {
		expect(getWinProbability(1400, 1000)).toBeCloseTo(10 / 11, 4);
	});
});

describe('getActualWins', () => {
	it('scores first out of four as three wins and last as none', () => {
		expect(getActualWins([0, 1, 2, 3])).toEqual([3, 2, 1, 0]);
	});

	it('shares the places a tie covers rather than inventing a winner', () => {
		expect(getActualWins([0, 0, 2, 3])).toEqual([2.5, 2.5, 1, 0]);
	});

	it('gives everyone the same when the whole game ties', () => {
		expect(getActualWins([0, 0, 0])).toEqual([1, 1, 1]);
	});

	it('always totals the number of matches in a round robin', () => {
		for (const positions of [
			[0, 1],
			[0, 1, 2],
			[0, 1, 2, 3],
			[0, 0, 2, 3],
			[0, 1, 1, 3],
		]) {
			const teams = positions.length;
			expect(sum(getActualWins(positions))).toBeCloseTo((teams * (teams - 1)) / 2, 9);
		}
	});
});

describe('getExpectedWins', () => {
	it('expects an even field to split its matches evenly', () => {
		const elos = [BASE_ELO, BASE_ELO, BASE_ELO, BASE_ELO];

		expect(getExpectedWins(elos, 0)).toBeCloseTo(1.5, 9);
	});

	it('totals the same as the actual wins do, which is what keeps it zero-sum', () => {
		const elos = [1150, 1000, 950, 900];
		const total = sum(elos.map((_, index) => getExpectedWins(elos, index)));

		expect(total).toBeCloseTo(6, 9);
	});
});

describe('getRatingChanges', () => {
	it('pays the published position scores when the field is even', () => {
		const players = [
			...squad(0, BASE_ELO, 4, 'a'),
			...squad(1, BASE_ELO, 4, 'b'),
			...squad(2, BASE_ELO, 4, 'c'),
			...squad(3, BASE_ELO, 4, 'd'),
		];

		const byTeam = getRatingChanges(players, [0, 1, 2, 3], BASE_ELO);

		// 1.5 / 0.5 / -0.5 / -1.5 wins of overperformance, at K = 20.
		expect(byTeam.find(change => change.uid === 'a-0')?.delta).toBeCloseTo(30, 6);
		expect(byTeam.find(change => change.uid === 'b-0')?.delta).toBeCloseTo(10, 6);
		expect(byTeam.find(change => change.uid === 'c-0')?.delta).toBeCloseTo(-10, 6);
		expect(byTeam.find(change => change.uid === 'd-0')?.delta).toBeCloseTo(-30, 6);
	});

	it('moves a two-team game less than a four-team one', () => {
		const two = getRatingChanges([...squad(0, BASE_ELO, 5, 'a'), ...squad(1, BASE_ELO, 5, 'b')], [0, 1], BASE_ELO);

		expect(two.find(change => change.uid === 'a-0')?.delta).toBeCloseTo(10, 6);
	});

	it('is zero-sum among settled players', () => {
		const players = [
			...squad(0, 1200, 4, 'a'),
			...squad(1, 1000, 4, 'b'),
			...squad(2, 900, 4, 'c'),
			...squad(3, 850, 4, 'd'),
		];

		expect(sum(getRatingChanges(players, [0, 1, 2, 3], BASE_ELO).map(change => change.delta))).toBeCloseTo(0, 6);
	});

	it('pays less for winning with a stacked team than with a weak one', () => {
		const stacked = getRatingChanges([...squad(0, 1300, 5, 'a'), ...squad(1, 900, 5, 'b')], [0, 1], BASE_ELO).find(
			change => change.uid === 'a-0'
		)!.delta;

		const underdog = getRatingChanges([...squad(0, 900, 5, 'a'), ...squad(1, 1300, 5, 'b')], [0, 1], BASE_ELO).find(
			change => change.uid === 'a-0'
		)!.delta;

		expect(stacked).toBeGreaterThan(0);
		expect(underdog).toBeGreaterThan(stacked);
	});

	it('draws nothing when a team finishes exactly where it was expected to', () => {
		const players = [...squad(0, 1200, 5, 'a'), ...squad(1, 1200, 5, 'b')];
		const changes = getRatingChanges(players, [0, 0], BASE_ELO);

		expect(changes.every(change => Math.abs(change.delta) < 1e-9)).toBe(true);
	});

	it('swings a provisional player harder than a settled one', () => {
		const players = [
			{ uid: 'new', rating: undefined, team: 0 },
			...squad(0, BASE_ELO, 4, 'a'),
			...squad(1, BASE_ELO, 5, 'b'),
		];

		const changes = getRatingChanges(players, [0, 1], BASE_ELO);
		const newcomer = changes.find(change => change.uid === 'new')!;
		const settled = changes.find(change => change.uid === 'a-0')!;

		expect(newcomer.delta).toBeCloseTo(settled.delta * 2, 6);
	});

	it('seeds an unrated player from the group average', () => {
		const changes = getRatingChanges([{ uid: 'new', rating: undefined, team: 0 }], [0], 1150);

		expect(changes[0].before).toBe(1150);
	});
});

describe('applyRatingChange', () => {
	it('counts the game so the provisional period can end', () => {
		const change = { uid: 'a', before: 1000, after: 1030, delta: 30 };

		expect(applyRatingChange(rated(1000, 2), change, '2026-09-01T19:00:00.000Z')).toEqual({
			elo: 1030,
			games: 3,
			updatedAt: '2026-09-01T19:00:00.000Z',
		});
	});

	it('starts the count at one for a player who has never been rated', () => {
		const change = { uid: 'a', before: 1000, after: 1030, delta: 30 };

		expect(applyRatingChange(undefined, change, '2026-09-01T19:00:00.000Z').games).toBe(1);
	});
});
