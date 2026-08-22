import {
	applyMotmBonus,
	applyRatingChange,
	BASE_ELO,
	createStartingRating,
	fromDisplayRating,
	getActualWins,
	getExpectedRate,
	getRatingChanges,
	getSeedElo,
	getTeamRecords,
	getWinProbability,
	hasPlayed,
	isProvisional,
	MOTM_BONUS_ELO,
	PROVISIONAL_GAMES,
	toDisplayRating,
} from './rating';
import { toDisplayMovement } from './leaderboard';
import type { PlayerRating, TournamentMatch } from './types';

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

const match = (teamA: number, teamB: number, scoreA: number, scoreB: number): TournamentMatch => ({
	order: 0,
	teamA,
	teamB,
	scoreA,
	scoreB,
	updatedBy: 'ref',
	updatedAt: '2026-08-01T00:00:00.000Z',
});

/** Each pair reads "the first team beat the second". */
const beat = (...pairs: [number, number][]) => pairs.map(([a, b]) => match(a, b, 1, 0));

const drew = (...pairs: [number, number][]) => pairs.map(([a, b]) => match(a, b, 0, 0));

const sum = (numbers: number[]) => numbers.reduce((total, value) => total + value, 0);

const deltaOf = (changes: { uid: string; delta: number }[], uid: string) =>
	changes.find(change => change.uid === uid)!.delta;

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

describe('getTeamRecords', () => {
	it('counts a win whole and a draw as half to each, whichever way round it was scored', () => {
		const records = getTeamRecords(2, [...beat([0, 1]), ...drew([0, 1]), match(0, 1, 0, 2)]);

		expect(records[0]).toMatchObject({ played: 3, score: 1.5 });
		expect(records[1]).toMatchObject({ played: 3, score: 1.5 });
	});

	it('records who each team actually faced, not who it was scheduled to', () => {
		const records = getTeamRecords(3, beat([0, 1], [0, 2]));

		expect(records[0].opponents).toEqual([1, 2]);
		expect(records[2]).toEqual({ played: 1, score: 0, opponents: [0] });
	});

	// Left over from a lineup rebuilt after it was scored — the same case
	// `getStandings` ignores rather than throws on.
	it('ignores a match naming a team the lineup no longer has', () => {
		const records = getTeamRecords(2, beat([0, 1], [0, 5]));

		expect(records[0].played).toBe(1);
	});
});

describe('getExpectedRate', () => {
	it('expects an even field to split its matches evenly', () => {
		expect(getExpectedRate([BASE_ELO, BASE_ELO, BASE_ELO], 0, [1, 2])).toBeCloseTo(0.5, 9);
	});

	// The property the whole update rests on: two teams' expectations of each
	// other total exactly what their rates will, so the swings cancel.
	it('totals one across the two sides of a match', () => {
		const elos = [1200, 950];

		expect(getExpectedRate(elos, 0, [1]) + getExpectedRate(elos, 1, [0])).toBeCloseTo(1, 9);
	});

	it('is zero for a team that faced nobody', () => {
		expect(getExpectedRate([BASE_ELO, BASE_ELO], 0, [])).toBe(0);
	});
});

describe('getRatingChanges', () => {
	const four = [
		...squad(0, BASE_ELO, 4, 'a'),
		...squad(1, BASE_ELO, 4, 'b'),
		...squad(2, BASE_ELO, 4, 'c'),
		...squad(3, BASE_ELO, 4, 'd'),
	];

	/** A full four-team round robin finishing exactly in team order. */
	const ladder = beat([0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]);

	it('pays a clean sweep half a K, and the team that lost everything the same the other way', () => {
		const changes = getRatingChanges(four, ladder, [0, 1, 2, 3], BASE_ELO);

		// 0.8 x (rate - 0.5) + 0.2 x place, at K = 20.
		expect(deltaOf(changes, 'a-0')).toBeCloseTo(10, 6);
		expect(deltaOf(changes, 'b-0')).toBeCloseTo(20 / 6, 6);
		expect(deltaOf(changes, 'c-0')).toBeCloseTo(-20 / 6, 6);
		expect(deltaOf(changes, 'd-0')).toBeCloseTo(-10, 6);
	});

	// The whole point of reading a rate rather than a finishing place: winning
	// your evening is worth the same however many teams it was split into. Three
	// teams play more matches, not a longer slot.
	it('moves a two-team game exactly as far as a four-team one', () => {
		const two = getRatingChanges(
			[...squad(0, BASE_ELO, 5, 'a'), ...squad(1, BASE_ELO, 5, 'b')],
			beat([0, 1]),
			[0, 1],
			BASE_ELO
		);

		expect(deltaOf(two, 'a-0')).toBeCloseTo(10, 6);
	});

	// The complaint this change came from: two teams with identical records and a
	// third nowhere near used to read as +8 / 0 / -8, which said the top two were
	// as far apart as the bottom two.
	it('separates two teams level on record by where they finished, not by a whole place', () => {
		const players = [...squad(0, BASE_ELO, 5, 'a'), ...squad(1, BASE_ELO, 5, 'b'), ...squad(2, BASE_ELO, 5, 'c')];
		const matches = [...drew([0, 1], [0, 1]), ...beat([0, 2], [0, 2], [1, 2], [1, 2])];

		const changes = getRatingChanges(players, matches, [0, 1, 2], BASE_ELO);

		expect(deltaOf(changes, 'a-0')).toBeCloseTo(6, 6);
		expect(deltaOf(changes, 'b-0')).toBeCloseTo(4, 6);
		expect(deltaOf(changes, 'c-0')).toBeCloseTo(-10, 6);
	});

	// What the ordinal fifth is for. A pure rate cannot tell these two apart —
	// same wins, same draws, and only goal difference between them.
	it('always pays the team that won the table more than the one it edged out', () => {
		const players = [...squad(0, BASE_ELO, 5, 'a'), ...squad(1, BASE_ELO, 5, 'b'), ...squad(2, BASE_ELO, 5, 'c')];
		const matches = [...drew([0, 1], [0, 1]), match(0, 2, 4, 0), match(0, 2, 1, 0), ...beat([1, 2], [1, 2])];

		const changes = getRatingChanges(players, matches, [0, 1, 2], BASE_ELO);

		expect(deltaOf(changes, 'a-0')).toBeGreaterThan(deltaOf(changes, 'b-0'));
	});

	// Goal difference decides the order and nothing else. Running up a cricket
	// score against a squad that is a man down must not pay.
	it('does not pay for the size of the margin', () => {
		const players = [...squad(0, BASE_ELO, 5, 'a'), ...squad(1, BASE_ELO, 5, 'b')];

		const narrow = getRatingChanges(players, [match(0, 1, 1, 0)], [0, 1], BASE_ELO);
		const rout = getRatingChanges(players, [match(0, 1, 9, 0)], [0, 1], BASE_ELO);

		expect(deltaOf(rout, 'a-0')).toBeCloseTo(deltaOf(narrow, 'a-0'), 9);
	});

	it('is zero-sum among settled players', () => {
		const players = [
			...squad(0, 1200, 4, 'a'),
			...squad(1, 1000, 4, 'b'),
			...squad(2, 900, 4, 'c'),
			...squad(3, 850, 4, 'd'),
		];

		expect(sum(getRatingChanges(players, ladder, [0, 1, 2, 3], BASE_ELO).map(change => change.delta))).toBeCloseTo(
			0,
			6
		);
	});

	it('pays less for winning with a stacked team than with a weak one', () => {
		const stacked = deltaOf(
			getRatingChanges([...squad(0, 1300, 5, 'a'), ...squad(1, 900, 5, 'b')], beat([0, 1]), [0, 1], BASE_ELO),
			'a-0'
		);

		const underdog = deltaOf(
			getRatingChanges([...squad(0, 900, 5, 'a'), ...squad(1, 1300, 5, 'b')], beat([0, 1]), [0, 1], BASE_ELO),
			'a-0'
		);

		expect(stacked).toBeGreaterThan(0);
		expect(underdog).toBeGreaterThan(stacked);
	});

	it('draws nothing when a team finishes exactly where it was expected to', () => {
		const players = [...squad(0, 1200, 5, 'a'), ...squad(1, 1200, 5, 'b')];
		const changes = getRatingChanges(players, drew([0, 1]), [0, 0], BASE_ELO);

		expect(changes.every(change => Math.abs(change.delta) < 1e-9)).toBe(true);
	});

	it('records what the movement was read off', () => {
		const players = [...squad(0, BASE_ELO, 5, 'a'), ...squad(1, BASE_ELO, 5, 'b')];
		const changes = getRatingChanges(players, [...beat([0, 1]), ...drew([0, 1])], [0, 1], BASE_ELO);

		expect(changes.find(change => change.uid === 'a-0')).toMatchObject({ rate: 0.75, expected: 0.5 });
	});

	it('swings a provisional player harder than a settled one', () => {
		const players = [
			{ uid: 'new', rating: undefined, team: 0 },
			...squad(0, BASE_ELO, 4, 'a'),
			...squad(1, BASE_ELO, 5, 'b'),
		];

		const changes = getRatingChanges(players, beat([0, 1]), [0, 1], BASE_ELO);

		expect(deltaOf(changes, 'new')).toBeCloseTo(deltaOf(changes, 'a-0') * 2, 6);
	});

	it('seeds an unrated player from the group average', () => {
		const changes = getRatingChanges(
			[{ uid: 'new', rating: undefined, team: 0 }, ...squad(1, 1150, 1, 'b')],
			beat([0, 1]),
			[0, 1],
			1150
		);

		expect(changes.find(change => change.uid === 'new')!.before).toBe(1150);
	});

	// An evening that stopped after one scoreline said nothing about the team
	// that never got on — so they get no change rather than a zero one, and the
	// two who did play are rated as the two-team game it turned out to be.
	it('leaves out a team that never got on the pitch', () => {
		const players = [...squad(0, BASE_ELO, 4, 'a'), ...squad(1, BASE_ELO, 4, 'b'), ...squad(2, BASE_ELO, 4, 'c')];
		const changes = getRatingChanges(players, beat([0, 1]), [0, 1, 2], BASE_ELO);

		expect(changes.some(change => change.uid.startsWith('c-'))).toBe(false);
		expect(deltaOf(changes, 'a-0')).toBeCloseTo(10, 6);
	});
});

describe('applyRatingChange', () => {
	it('counts the game so the provisional period can end', () => {
		const change = { uid: 'a', before: 1000, after: 1030, delta: 30, rate: 1, expected: 0.5 };

		expect(applyRatingChange(rated(1000, 2), change, '2026-09-01T19:00:00.000Z')).toEqual({
			elo: 1030,
			games: 3,
			updatedAt: '2026-09-01T19:00:00.000Z',
		});
	});

	it('starts the count at one for a player who has never been rated', () => {
		const change = { uid: 'a', before: 1000, after: 1030, delta: 30, rate: 1, expected: 0.5 };

		expect(applyRatingChange(undefined, change, '2026-09-01T19:00:00.000Z').games).toBe(1);
	});
});

describe('applyMotmBonus', () => {
	const changes = (count: number) =>
		Array.from({ length: count }, (_, index) => ({
			uid: `p-${index}`,
			before: BASE_ELO,
			after: BASE_ELO,
			delta: 0,
			rate: 0.5,
			expected: 0.5,
		}));

	it('pays the winner the bonus, less their own share of it', () => {
		const after = applyMotmBonus(changes(10), ['p-0']);

		expect(after[0].delta).toBeCloseTo(MOTM_BONUS_ELO - MOTM_BONUS_ELO / 10, 9);
		expect(after[0].after).toBeCloseTo(BASE_ELO + MOTM_BONUS_ELO * 0.9, 9);
	});

	it('takes an equal share off everybody who played', () => {
		const after = applyMotmBonus(changes(10), ['p-0']);

		for (const change of after.slice(1)) expect(change.delta).toBeCloseTo(-MOTM_BONUS_ELO / 10, 9);
	});

	it('leaves the ladder where it found it', () => {
		expect(sum(applyMotmBonus(changes(12), ['p-3']).map(change => change.delta))).toBeCloseTo(0, 9);
		expect(sum(applyMotmBonus(changes(12), ['p-3', 'p-8']).map(change => change.delta))).toBeCloseTo(0, 9);
	});

	it('splits the pot between everybody level on the vote', () => {
		const after = applyMotmBonus(changes(10), ['p-0', 'p-1']);

		expect(after[0].delta).toBeCloseTo(MOTM_BONUS_ELO / 2 - MOTM_BONUS_ELO / 10, 9);
		expect(after[0].delta).toBeCloseTo(after[1].delta, 9);
	});

	it('adds to whatever the football already did rather than replacing it', () => {
		const played = [{ uid: 'a', before: BASE_ELO, after: BASE_ELO + 30, delta: 30, rate: 1, expected: 0.5 }];

		expect(applyMotmBonus(played, ['a'])[0].delta).toBe(30);
	});

	it('leaves everyone alone when nobody won it', () => {
		expect(applyMotmBonus(changes(8), [])).toEqual(changes(8));
	});

	// A reshuffle after somebody was voted for can leave a winner who is no
	// longer in the game. Charging everyone for a pot nobody collects would
	// quietly deflate the whole ladder.
	it('leaves everyone alone when the winner is not in the game', () => {
		expect(applyMotmBonus(changes(8), ['stranger'])).toEqual(changes(8));
	});

	it('funds the pot from the winners it can actually pay', () => {
		const after = applyMotmBonus(changes(10), ['p-0', 'stranger']);

		expect(after[0].delta).toBeCloseTo(MOTM_BONUS_ELO - MOTM_BONUS_ELO / 10, 9);
		expect(sum(after.map(change => change.delta))).toBeCloseTo(0, 9);
	});

	// The property the bonus exists for, and the one it lost in silence when
	// `K_FACTOR` was retuned from 50 to 20: `toDisplayMovement` rounds to whole
	// display points, so a pot under 5 Elo leaves the winner reading the same
	// `+4` as the four teammates they were voted ahead of. Every test above
	// passed throughout, because each is written relative to `MOTM_BONUS_ELO`
	// and the bonus was applied correctly — it just could not be seen.
	//
	// Pinned against the display rather than against a number, so the next
	// retune of K fails here rather than in front of the group. The gap is
	// exactly one point for any football underneath: the levy moves winner and
	// teammate together, leaving a whole display point between them, and
	// `round(x + 1)` is always `round(x) + 1`.
	it('moves the winner a visible display point clear of their team', () => {
		const alone = applyMotmBonus(changes(11), ['p-0']);

		expect(toDisplayMovement(alone[0].delta) - toDisplayMovement(alone[1].delta)).toBe(1);

		// The evening that reported this: eleven played, five of them won it
		// outright at the provisional K, and one was man of the match.
		const won = changes(11).map(change => ({ ...change, delta: 19.79, after: BASE_ELO + 19.79 }));
		const after = applyMotmBonus(won, ['p-0']);

		expect(toDisplayMovement(after[0].delta)).toBe(5);
		expect(toDisplayMovement(after[1].delta)).toBe(4);
	});
});
