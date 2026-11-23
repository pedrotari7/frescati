import { getClubRecap, isSeasonFinished, topAward } from './recap';
import type { RecapInput } from './recap';
import type { Game, GameResponse, RatingLedgerEntry, TournamentMatch } from './types';

const SEASON = 's1';

const entry = (
	gameId: string,
	day: number,
	positions: Record<string, number>,
	teams?: Record<string, number>
): RatingLedgerEntry => {
	const kickoff = `2026-09-${String(day).padStart(2, '0')}T17:00:00.000Z`;

	return {
		seasonId: SEASON,
		gameId,
		kickoff,
		kickoffMillis: Date.parse(kickoff),
		finalisedAt: kickoff,
		positions,
		before: {},
		after: {},
		...(teams ? { teams } : {}),
	} as RatingLedgerEntry;
};

const game = (id: string, status: Game['status'], endsAt: string): Pick<Game, 'id' | 'status' | 'endsAt'> => ({
	id,
	status,
	endsAt,
});

const match = (order: number, scoreA: number, scoreB: number): TournamentMatch => ({
	order,
	teamA: 0,
	teamB: 1,
	scoreA,
	scoreB,
	updatedBy: 'x',
	updatedAt: '2026-09-01T18:00:00.000Z',
});

const response = (uid: string, role: GameResponse['role'] = 'member'): GameResponse =>
	({ uid, status: 'in', role, respondedAt: '', updatedAt: '' }) as GameResponse;

const input = (overrides: Partial<RecapInput>): RecapInput => ({
	seasonId: SEASON,
	memberUids: [],
	games: [],
	entries: [],
	responses: {},
	motm: {},
	matches: {},
	...overrides,
});

describe('isSeasonFinished', () => {
	const NOW = '2026-10-01T00:00:00.000Z';
	const PAST = '2026-09-01T18:00:00.000Z';
	const FUTURE = '2026-10-08T18:00:00.000Z';

	it('is finished when every game has ended and been rated', () => {
		const games = [game('g1', 'played', PAST), game('g2', 'scheduled', PAST)];

		expect(isSeasonFinished(games, [{ gameId: 'g1' }, { gameId: 'g2' }], NOW)).toBe(true);
	});

	it('waits for a game that ended without a rating', () => {
		expect(
			isSeasonFinished([game('g1', 'played', PAST), game('g2', 'scheduled', PAST)], [{ gameId: 'g1' }], NOW)
		).toBe(false);
	});

	it('waits for a game still to come', () => {
		const games = [game('g1', 'played', PAST), game('g2', 'scheduled', FUTURE)];

		expect(isSeasonFinished(games, [{ gameId: 'g1' }, { gameId: 'g2' }], NOW)).toBe(false);
	});

	it('leaves a cancelled game out of it', () => {
		expect(
			isSeasonFinished([game('g1', 'played', PAST), game('g2', 'cancelled', PAST)], [{ gameId: 'g1' }], NOW)
		).toBe(true);
	});

	it('never calls a season with no games finished', () => {
		expect(isSeasonFinished([], [], NOW)).toBe(false);
	});

	it('never calls a season of cancelled games finished', () => {
		expect(isSeasonFinished([game('g1', 'cancelled', PAST)], [], NOW)).toBe(false);
	});
});

describe('topAward', () => {
	it('shares a tie at the top', () => {
		expect(
			topAward(
				new Map([
					['a', 3],
					['b', 3],
					['c', 1],
				])
			)
		).toEqual({ uids: ['a', 'b'], value: 3 });
	});

	it('gives nothing for an empty map', () => {
		expect(topAward(new Map())).toBeNull();
	});

	it('gives nothing when nobody is above the floor', () => {
		expect(topAward(new Map([['a', 0]]))).toBeNull();
		expect(topAward(new Map([['a', 2]]), 2)).toBeNull();
	});
});

describe('getClubRecap', () => {
	it('counts the games, the goals and the people', () => {
		const club = getClubRecap(
			input({
				memberUids: ['a', 'b', 'c'],
				entries: [entry('g1', 1, { a: 0, b: 1, x: 0 }), entry('g2', 8, { a: 0, b: 1, c: 1 })],
				responses: { g1: { x: response('x', 'extra') }, g2: { y: response('y', 'extra') } },
				matches: { g1: [match(0, 2, 1), match(1, 0, 0)], g2: [match(0, 3, 3)] },
			})
		);

		expect(club.gamesPlayed).toBe(2);
		expect(club.totalGoals).toBe(9);
		expect(club.players).toBe(4);
		expect(club.averageTurnout).toBe(3);
		// `y` answered as an extra and never played, so is not counted.
		expect(club.extras).toBe(1);
	});

	it('rounds the average turnout to one decimal', () => {
		const club = getClubRecap(
			input({
				entries: [
					entry('g1', 1, { a: 0, b: 1 }),
					entry('g2', 8, { a: 0, b: 1, c: 1 }),
					entry('g3', 15, { a: 0 }),
				],
			})
		);

		expect(club.averageTurnout).toBe(2);

		expect(
			getClubRecap(
				input({
					entries: [
						entry('g1', 1, { a: 0 }),
						entry('g2', 8, { a: 0, b: 1 }),
						entry('g3', 15, { a: 0, b: 1 }),
					],
				})
			).averageTurnout
		).toBe(1.7);
	});

	it('puts everybody level on a step of the podium', () => {
		const club = getClubRecap(
			input({
				entries: [entry('g1', 1, { a: 0, b: 0, c: 1, d: 2 }), entry('g2', 8, { a: 1, b: 1, c: 0, d: 2 })],
			})
		);

		// a and b won one each and tie on movement (all zero here), c too, so
		// the podium is everybody who shares a place in the top three.
		expect(club.podium.map(row => row.uid).sort()).toEqual(['a', 'b', 'c']);
		expect(club.podium.every(row => row.position <= 2)).toBe(true);
	});

	it('picks the games worth remembering', () => {
		const club = getClubRecap(
			input({
				entries: [entry('g1', 1, { a: 0, b: 1 }), entry('g2', 8, { a: 0, b: 1, c: 1 })],
				matches: { g1: [match(0, 4, 1), match(1, 2, 2)], g2: [match(0, 3, 2), match(1, 5, 0)] },
			})
		);

		expect(club.highestScoring).toMatchObject({ gameId: 'g1', match: { scoreA: 4, scoreB: 1 } });
		expect(club.biggestWin).toMatchObject({ gameId: 'g2', match: { scoreA: 5, scoreB: 0 } });
		// 2-2 is a draw, not a finish, so 3-2 is the closest one.
		expect(club.closestFinish).toMatchObject({ gameId: 'g2', match: { scoreA: 3, scoreB: 2 } });
		expect(club.bestTurnout).toEqual({ gameId: 'g2', kickoff: '2026-09-08T17:00:00.000Z', turnout: 3 });
	});

	it('breaks a tie on the earlier game', () => {
		const club = getClubRecap(
			input({
				entries: [entry('g2', 8, { a: 0 }), entry('g1', 1, { a: 0 })],
				matches: { g2: [match(0, 3, 1)], g1: [match(0, 1, 3)] },
			})
		);

		expect(club.highestScoring?.gameId).toBe('g1');
		expect(club.biggestWin?.gameId).toBe('g1');
	});

	it('has nothing to say about an empty season', () => {
		expect(getClubRecap(input({}))).toEqual({
			gamesPlayed: 0,
			totalGoals: 0,
			averageTurnout: 0,
			players: 0,
			extras: 0,
			podium: [],
			highestScoring: null,
			biggestWin: null,
			closestFinish: null,
			bestTurnout: null,
		});
	});
});
