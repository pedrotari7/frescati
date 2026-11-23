import {
	NEMESIS_MIN_GAMES,
	SPOON_MIN_APPEARANCES,
	getAwards,
	getBanter,
	getClubRecap,
	getPersonalRecap,
	isSeasonFinished,
	topAward,
} from './recap';
import type { RecapInput } from './recap';
import type { Game, GameResponse, RatingLedgerEntry, TournamentMatch, TournamentMotm } from './types';

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

const response = (
	uid: string,
	role: GameResponse['role'] = 'member',
	extra: Partial<GameResponse> = {}
): GameResponse => ({ uid, status: 'in', role, respondedAt: '', updatedAt: '', ...extra }) as GameResponse;

const motm = (winners: string[], counts: Record<string, number> = {}): TournamentMotm =>
	({ winners, counts: Object.entries(counts).map(([uid, votes]) => ({ uid, votes })) }) as TournamentMotm;

/** One game a week from 1 September, with `results` as each player's finishing place. */
const season = (results: Record<string, number>[]): RatingLedgerEntry[] =>
	results.map((positions, index) => entry(`g${index + 1}`, 1 + index * 7, positions));

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

describe('getAwards', () => {
	it('counts man-of-the-match wins, shared ones included', () => {
		const awards = getAwards(
			input({
				entries: season([
					{ a: 0, b: 1 },
					{ a: 0, b: 1 },
				]),
				motm: { g1: motm(['a', 'b']), g2: motm(['a']) },
			})
		);

		expect(awards.motm).toEqual({ uids: ['a'], value: 2 });
	});

	it('finds the longest run of wins in kickoff order', () => {
		// a: W W L W W W, b wins the one a lost and nothing else.
		const results = [0, 0, 1, 0, 0, 0].map(a => ({ a, b: 1 - a }));
		const awards = getAwards(input({ entries: season(results).reverse() }));

		expect(awards.streak).toEqual({ uids: ['a'], value: 3 });
	});

	it('reads two games kicking off at once in game id order', () => {
		// Same kickoff: g1 is a win and g2 a loss, so the run that ends the season is g3 alone.
		const entries = [entry('g2', 1, { a: 1 }), entry('g1', 1, { a: 0 }), entry('g3', 8, { a: 0 })];

		expect(getAwards(input({ entries })).streak).toEqual({ uids: ['a'], value: 1 });
	});

	it('shares the streak when two runs are as long', () => {
		const awards = getAwards(
			input({
				entries: season([
					{ a: 0, b: 1 },
					{ a: 0, b: 1 },
					{ a: 1, b: 0 },
					{ a: 1, b: 0 },
				]),
			})
		);

		expect(awards.streak).toEqual({ uids: ['a', 'b'], value: 2 });
	});

	it('hands iron man to the most appearances and lists anybody who never missed', () => {
		const awards = getAwards(
			input({
				entries: season([
					{ a: 0, b: 1, c: 1 },
					{ a: 0, b: 1 },
					{ a: 0, c: 1 },
				]),
			})
		);

		expect(awards.ironMan).toEqual({ uids: ['a'], value: 3 });
		expect(awards.perfectAttendance).toEqual(['a']);
	});

	it('names no climber when nobody gained', () => {
		expect(getAwards(input({ entries: season([{ a: 0, b: 1 }]) })).climber).toBeNull();
	});

	it('names the biggest climber', () => {
		const entries = season([{ a: 0, b: 1 }]).map(entry => ({
			...entry,
			before: { a: { elo: 1000 }, b: { elo: 1000 } },
			after: { a: { elo: 1020 }, b: { elo: 980 } },
		})) as unknown as RatingLedgerEntry[];

		expect(getAwards(input({ entries })).climber).toEqual({ uids: ['a'], value: 20 });
	});
});

describe('getBanter', () => {
	it('counts the no-shows', () => {
		const banter = getBanter(
			input({
				entries: season([{ a: 0 }, { a: 0 }]),
				responses: {
					g1: { b: response('b', 'member', { absent: true }) },
					g2: { b: response('b', 'member', { absent: true }), c: response('c', 'member', { absent: true }) },
				},
			})
		);

		expect(banter.noShows).toEqual({ uids: ['b'], value: 2 });
	});

	it('has no no-show award when everybody turned up', () => {
		expect(
			getBanter(input({ entries: season([{ a: 0 }]), responses: { g1: { a: response('a') } } })).noShows
		).toBeNull();
	});

	it('counts an answer last touched in the 24 hours before kickoff, and nothing either side of it', () => {
		// g1 kicks off at 2026-09-01T17:00Z.
		const at = (updatedAt: string) => response('x', 'member', { updatedAt });
		const banter = getBanter(
			input({
				entries: season([{ a: 0 }]),
				responses: {
					g1: {
						edge: { ...at('2026-08-31T17:00:00.000Z'), uid: 'edge' },
						early: { ...at('2026-08-31T16:59:59.999Z'), uid: 'early' },
						after: { ...at('2026-09-01T17:00:00.001Z'), uid: 'after' },
					},
					// No ledger entry, so the game never happened as far as the recap knows.
					g9: { ghost: { ...at('2026-09-01T16:00:00.000Z'), uid: 'ghost' } },
				},
			})
		);

		expect(banter.lastMinute).toEqual({ uids: ['edge'], value: 1 });
	});

	it('gives the spoon to the lowest player with enough games, not the one who barely played', () => {
		// d is bottom but played twice; c is the lowest of those with three.
		const banter = getBanter(
			input({
				entries: season([
					{ a: 0, b: 1, c: 2, d: 3 },
					{ a: 0, b: 1, c: 1, d: 3 },
					{ a: 1, b: 0, c: 2 },
				]),
			})
		);

		expect(SPOON_MIN_APPEARANCES).toBe(3);
		expect(banter.woodenSpoon).toEqual({ uids: ['c'], value: 0 });
	});

	it('has no spoon when nobody played enough', () => {
		expect(
			getBanter(
				input({
					entries: season([
						{ a: 0, b: 1 },
						{ a: 1, b: 0 },
					]),
				})
			).woodenSpoon
		).toBeNull();
	});
});

describe('getPersonalRecap', () => {
	/** A game with teams and ratings: `elo` is each player's [before, after], `null` before for an arrival. */
	const rated = (
		gameId: string,
		day: number,
		positions: Record<string, number>,
		teams: Record<string, number> | undefined,
		elo: Record<string, [number | null, number]>,
		seedElo?: number
	): RatingLedgerEntry =>
		({
			...entry(gameId, day, positions, teams),
			before: Object.fromEntries(Object.entries(elo).map(([uid, [b]]) => [uid, b === null ? null : { elo: b }])),
			after: Object.fromEntries(Object.entries(elo).map(([uid, [, a]]) => [uid, { elo: a }])),
			...(seedElo === undefined ? {} : { seedElo }),
		}) as unknown as RatingLedgerEntry;

	it('has nothing for somebody who never played', () => {
		expect(getPersonalRecap(input({ entries: season([{ a: 0 }]) }), 'z')).toBeNull();
	});

	it('follows one game from before to after', () => {
		const personal = getPersonalRecap(
			input({ entries: [rated('g1', 1, { a: 0, b: 1 }, undefined, { a: [1000, 1010], b: [1000, 990] })] }),
			'a'
		);

		expect(personal?.journey).toEqual([1000, 1010]);
		expect(personal?.winRate).toBe(1);
		expect(personal?.row.appearances).toBe(1);
	});

	it('starts an arrival at the seed the game rated them from', () => {
		const personal = getPersonalRecap(
			input({ entries: [rated('g1', 1, { a: 0, b: 1 }, undefined, { a: [null, 1012], b: [1000, 990] }, 1002)] }),
			'a'
		);

		expect(personal?.journey).toEqual([1002, 1012]);
	});

	it('finds the teammate they won most with', () => {
		const personal = getPersonalRecap(
			input({
				entries: [
					rated('g1', 1, { a: 0, b: 0, c: 1 }, { a: 0, b: 0, c: 1 }, {}),
					rated('g2', 8, { a: 0, b: 1, c: 0 }, { a: 0, b: 1, c: 0 }, {}),
					rated('g3', 15, { a: 0, b: 0, c: 1 }, { a: 0, b: 0, c: 1 }, {}),
				],
			}),
			'a'
		);

		expect(personal?.bestTeammate).toEqual({ uid: 'b', wonTogether: 2 });
	});

	it('needs two meetings before somebody is a nemesis', () => {
		const once = [rated('g1', 1, { a: 1, n: 0 }, { a: 0, n: 1 }, {})];
		const twice = [...once, rated('g2', 8, { a: 1, n: 0 }, { a: 0, n: 1 }, {})];

		expect(NEMESIS_MIN_GAMES).toBe(2);
		expect(getPersonalRecap(input({ entries: once }), 'a')?.nemesis).toBeNull();
		expect(getPersonalRecap(input({ entries: twice }), 'a')?.nemesis).toEqual({ uid: 'n', beat: 0, lostTo: 2 });
	});

	it('has no nemesis for an even record', () => {
		const entries = [
			rated('g1', 1, { a: 1, n: 0 }, { a: 0, n: 1 }, {}),
			rated('g2', 8, { a: 0, n: 1 }, { a: 0, n: 1 }, {}),
		];

		expect(getPersonalRecap(input({ entries }), 'a')?.nemesis).toBeNull();
	});

	it('leaves the people out of games written before teams were stored', () => {
		const personal = getPersonalRecap(
			input({
				entries: season([
					{ a: 0, b: 0, c: 1 },
					{ a: 1, c: 0 },
				]),
			}),
			'a'
		);

		expect(personal?.bestTeammate).toBeNull();
		expect(personal?.nemesis).toBeNull();
	});

	it('only counts meetings from this season', () => {
		const other = { ...rated('x1', 1, { a: 1, n: 0 }, { a: 0, n: 1 }, {}), seasonId: 'other' };
		const entries = [other, other, rated('g1', 8, { a: 1, n: 0 }, { a: 0, n: 1 }, {})];

		expect(getPersonalRecap(input({ entries }), 'a')?.nemesis).toBeNull();
	});

	it('adds up their man-of-the-match votes and wins', () => {
		const personal = getPersonalRecap(
			input({
				entries: season([
					{ a: 0, b: 1 },
					{ a: 0, b: 1 },
				]),
				motm: { g1: motm(['a'], { a: 3, b: 1 }), g2: motm(['b'], { a: 1, b: 2 }) },
			}),
			'a'
		);

		expect(personal?.motmVotes).toBe(4);
		expect(personal?.motmWins).toBe(1);
	});

	it('picks the game they gained the most in', () => {
		const personal = getPersonalRecap(
			input({
				entries: [
					rated('g1', 1, { a: 0 }, undefined, { a: [1000, 1008] }),
					rated('g2', 8, { a: 0 }, undefined, { a: [1008, 1020] }),
					rated('g3', 15, { a: 1 }, undefined, { a: [1020, 1010] }),
				],
			}),
			'a'
		);

		expect(personal?.bestGame).toEqual({ gameId: 'g2', kickoff: '2026-09-08T17:00:00.000Z', gain: 12 });
	});

	it('breaks a tie between teammates on games together, then on name', () => {
		const games = [
			rated('g1', 1, { a: 0, b: 0, c: 0, d: 0, x: 1 }, { a: 0, b: 0, c: 0, d: 0, x: 1 }, {}),
			rated('g2', 8, { a: 1, b: 1, x: 0 }, { a: 0, b: 0, x: 1 }, {}),
		];

		// b, c and d each won once with a; b also lost once beside them.
		expect(getPersonalRecap(input({ entries: games }), 'a')?.bestTeammate?.uid).toBe('b');
		expect(getPersonalRecap(input({ entries: games.slice(0, 1) }), 'a')?.bestTeammate?.uid).toBe('b');
	});

	it('breaks a tie between nemeses on the fewer wins against them, then on name', () => {
		const lose = (gameId: string, day: number, to: string) =>
			rated(gameId, day, { a: 1, [to]: 0 }, { a: 0, [to]: 1 }, {});
		const beat = (gameId: string, day: number, who: string) =>
			rated(gameId, day, { a: 0, [who]: 1 }, { a: 0, [who]: 1 }, {});

		const uneven = [
			lose('g1', 1, 'm'),
			lose('g2', 2, 'm'),
			beat('g3', 3, 'm'),
			lose('g4', 4, 'n'),
			lose('g5', 5, 'n'),
		];
		expect(getPersonalRecap(input({ entries: uneven }), 'a')?.nemesis?.uid).toBe('n');

		const level = [lose('g1', 1, 'n'), lose('g2', 2, 'n'), lose('g3', 3, 'm'), lose('g4', 4, 'm')];
		expect(getPersonalRecap(input({ entries: level }), 'a')?.nemesis?.uid).toBe('m');
	});

	it('has no best game when every game cost them', () => {
		const personal = getPersonalRecap(
			input({ entries: [rated('g1', 1, { a: 1 }, undefined, { a: [1000, 990] })] }),
			'a'
		);

		expect(personal?.bestGame).toBeNull();
	});
});
