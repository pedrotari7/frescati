import { getForm, getRivalry, getStorylines, getTeamOdds, isGameDay } from './matchday';
import { fromDisplayRating, getWinProbability } from './rating';
import type { PlayerRating, RatingLedgerEntry, TournamentTeams } from './types';
import { DEFAULT_BALANCE_SETTINGS } from './types';

const DAY = 86_400_000;

/**
 * One rated game. `teams` maps uid to the team they were on, `positions` to
 * where that team finished. Left without `teams` to stand in for an entry
 * written before the field existed.
 */
const entry = ({
	gameId,
	kickoffMillis,
	positions,
	teams,
	motm,
}: {
	gameId: string;
	kickoffMillis: number;
	positions: Record<string, number>;
	teams?: Record<string, number>;
	motm?: string[];
}): RatingLedgerEntry =>
	({
		seasonId: 'season-1',
		gameId,
		kickoff: new Date(kickoffMillis).toISOString(),
		kickoffMillis,
		finalisedAt: new Date(kickoffMillis + 3_600_000).toISOString(),
		positions,
		teams,
		motm,
		before: Object.fromEntries(Object.keys(positions).map(uid => [uid, { elo: 1000, games: 1 }])),
		after: Object.fromEntries(Object.keys(positions).map(uid => [uid, { elo: 1000, games: 2 }])),
	}) as unknown as RatingLedgerEntry;

/** `uid` on team 0 and somebody else on team 1, with `uid`'s team finishing `place`. */
const result = (uid: string, gameId: string, kickoffMillis: number, place: 'win' | 'draw' | 'loss') =>
	entry({
		gameId,
		kickoffMillis,
		teams: { [uid]: 0, other: 1 },
		positions:
			place === 'win'
				? { [uid]: 0, other: 1 }
				: place === 'draw'
					? { [uid]: 0, other: 0 }
					: { [uid]: 1, other: 0 },
	});

const series = (uid: string, places: ('win' | 'draw' | 'loss')[], startMillis = 0) =>
	places.map((place, index) => result(uid, `${uid}-${index}`, startMillis + index * 7 * DAY, place));

const lineup = (
	squads: string[][],
	elos: Record<string, number>
): Pick<TournamentTeams, 'teams' | 'elos' | 'settings'> => ({
	teams: squads.map((uids, index) => ({ index, uids })),
	elos,
	settings: DEFAULT_BALANCE_SETTINGS,
});

const STOCKHOLM = { responseDeadlineHours: 3, slot: { timezone: 'Europe/Stockholm' } };

describe('isGameDay', () => {
	// 19:00 Stockholm on 2026-11-24, which is 18:00 UTC in winter.
	const game = {
		kickoff: '2026-11-24T18:00:00.000Z',
		endsAt: '2026-11-24T19:30:00.000Z',
		status: 'scheduled' as const,
	};

	it('is game day from just after midnight in the season timezone', () => {
		expect(isGameDay(game, STOCKHOLM, new Date('2026-11-23T23:01:00.000Z'))).toBe(true);
	});

	it('is not game day a minute before midnight in the season timezone', () => {
		expect(isGameDay(game, STOCKHOLM, new Date('2026-11-23T22:59:00.000Z'))).toBe(false);
	});

	it('is still game day while the game is being played', () => {
		expect(isGameDay(game, STOCKHOLM, new Date('2026-11-24T18:30:00.000Z'))).toBe(true);
	});

	it('stops being game day at the final whistle', () => {
		expect(isGameDay(game, STOCKHOLM, new Date('2026-11-24T19:30:00.000Z'))).toBe(false);
	});

	it('is never game day for a cancelled game', () => {
		expect(isGameDay({ ...game, status: 'cancelled' }, STOCKHOLM, new Date('2026-11-24T10:00:00.000Z'))).toBe(
			false
		);
	});
});

describe('getTeamOdds', () => {
	it('splits two equal teams down the middle', () => {
		const odds = getTeamOdds(
			lineup(
				[
					['a', 'b'],
					['c', 'd'],
				],
				{ a: 1000, b: 1000, c: 1000, d: 1000 }
			),
			90,
			'g'
		);

		expect(odds).toEqual([
			{ team: 0, percent: 50 },
			{ team: 1, percent: 50 },
		]);
	});

	it('gives two teams their Elo win probability', () => {
		const odds = getTeamOdds(
			lineup(
				[
					['a', 'b'],
					['c', 'd'],
				],
				{ a: 1300, b: 1100, c: 1000, d: 1000 }
			),
			90,
			'g'
		);
		const expected = Math.round(100 * getWinProbability(1200, 1000));

		expect(odds[0].percent).toBe(expected);
		expect(odds[0].percent + odds[1].percent).toBe(100);
	});

	const three = lineup([['a'], ['b'], ['c']], { a: 1200, b: 1000, c: 900 });

	it('gives three teams whole percentages that total 100', () => {
		const odds = getTeamOdds(three, 90, 'g');

		expect(odds.map(row => row.team)).toEqual([0, 1, 2]);
		expect(odds.reduce((total, row) => total + row.percent, 0)).toBe(100);
	});

	it('makes the strongest of three teams the favourite', () => {
		const [strongest, ...rest] = getTeamOdds(three, 90, 'g');

		for (const row of rest) expect(strongest.percent).toBeGreaterThan(row.percent);
	});

	it('gives the same three-team odds for the same seed', () => {
		expect(getTeamOdds(three, 90, 'seed-1')).toEqual(getTeamOdds(three, 90, 'seed-1'));
	});

	it('still totals 100 under a different seed', () => {
		const odds = getTeamOdds(three, 90, 'seed-2');

		expect(odds.reduce((total, row) => total + row.percent, 0)).toBe(100);
	});
});

describe('getForm', () => {
	it('reads the last five results oldest first', () => {
		const entries = series('ana', ['loss', 'win', 'win', 'draw', 'loss', 'win']);

		expect(getForm(entries, ['ana'])).toEqual([{ uid: 'ana', results: ['W', 'W', 'D', 'L', 'W'] }]);
	});

	it('reads a first place with no teams map as a win', () => {
		const entries = [entry({ gameId: 'old', kickoffMillis: 0, positions: { ana: 0, other: 0 } })];

		expect(getForm(entries, ['ana'])[0].results).toEqual(['W']);
	});

	it('gives a player with no games an empty line', () => {
		expect(getForm([], ['rui'])).toEqual([{ uid: 'rui', results: [] }]);
	});
});

describe('getRivalry', () => {
	/** Ana against Joao on opposite teams, Ana's team finishing `place`. */
	const meeting = (gameId: string, kickoffMillis: number, place: 'win' | 'draw' | 'loss') =>
		entry({
			gameId,
			kickoffMillis,
			teams: { ana: 0, joao: 1 },
			positions:
				place === 'win' ? { ana: 0, joao: 1 } : place === 'draw' ? { ana: 0, joao: 0 } : { ana: 1, joao: 0 },
		});

	const together = (gameId: string) =>
		entry({ gameId, kickoffMillis: 0, teams: { ana: 0, joao: 0 }, positions: { ana: 0, joao: 0 } });

	const tonight = {
		teams: [
			{ index: 0, uids: ['ana'] },
			{ index: 1, uids: ['joao'] },
		],
	};

	it('picks the opposite-team pair with the most meetings', () => {
		const entries = [meeting('g1', 1, 'win'), meeting('g2', 2, 'loss'), meeting('g3', 3, 'win'), together('g4')];

		expect(getRivalry(entries, ['ana', 'joao'], tonight)).toMatchObject({
			a: 'ana',
			b: 'joao',
			meetings: 3,
			aWins: 2,
			bWins: 1,
			draws: 0,
			tonight: true,
		});
	});

	it('ignores entries with no teams map', () => {
		const old = entry({ gameId: 'old', kickoffMillis: 0, positions: { ana: 0, joao: 1 } });

		expect(
			getRivalry([meeting('g1', 1, 'win'), meeting('g2', 2, 'win'), old], ['ana', 'joao'], tonight)
		).toBeNull();
	});

	it('needs three meetings', () => {
		expect(getRivalry([meeting('g1', 1, 'win'), meeting('g2', 2, 'win')], ['ana', 'joao'], tonight)).toBeNull();
	});

	it('carries a run of two or more the same way', () => {
		const entries = [meeting('g1', 1, 'loss'), meeting('g2', 2, 'win'), meeting('g3', 3, 'win')];

		expect(getRivalry(entries, ['ana', 'joao'], tonight)?.run).toEqual({ uid: 'ana', count: 2 });
	});

	it('has no run after a draw', () => {
		const entries = [meeting('g1', 1, 'win'), meeting('g2', 2, 'win'), meeting('g3', 3, 'draw')];

		expect(getRivalry(entries, ['ana', 'joao'], tonight)?.run).toBeNull();
	});

	it('leaves out a pair on the same team tonight', () => {
		const entries = [meeting('g1', 1, 'win'), meeting('g2', 2, 'win'), meeting('g3', 3, 'win')];
		const sameSide = {
			teams: [
				{ index: 0, uids: ['ana', 'joao'] },
				{ index: 1, uids: [] },
			],
		};

		expect(getRivalry(entries, ['ana', 'joao'], sameSide)).toBeNull();
	});

	it('considers every pair in the pool before there are teams', () => {
		const entries = [meeting('g1', 1, 'win'), meeting('g2', 2, 'win'), meeting('g3', 3, 'win')];

		expect(getRivalry(entries, ['ana', 'joao'], null)).toMatchObject({ meetings: 3, tonight: false });
	});

	it('breaks a tie on meetings by the closer record', () => {
		const versus = (other: string, gameId: string, kickoffMillis: number, anaWins: boolean) =>
			entry({
				gameId,
				kickoffMillis,
				teams: { ana: 0, [other]: 1 },
				positions: anaWins ? { ana: 0, [other]: 1 } : { ana: 1, [other]: 0 },
			});
		const entries = [
			versus('bea', 'b1', 1, true),
			versus('bea', 'b2', 2, true),
			versus('bea', 'b3', 3, true),
			versus('caio', 'c1', 4, true),
			versus('caio', 'c2', 5, false),
			versus('caio', 'c3', 6, true),
		];

		expect(getRivalry(entries, ['ana', 'bea', 'caio'], null)).toMatchObject({ a: 'ana', b: 'caio' });
	});
});

describe('getStorylines', () => {
	const KICKOFF = 100 * 7 * DAY;
	const rated = (display: number): PlayerRating => ({ elo: fromDisplayRating(display), games: 10, updatedAt: '' });
	const settled = rated(55);

	it('tells a winning run of three', () => {
		const entries = series('ana', ['win', 'win', 'win'], KICKOFF - 21 * DAY);

		expect(getStorylines(entries, ['ana'], { ana: settled }, KICKOFF)).toEqual([
			{ kind: 'winRun', uid: 'ana', count: 3 },
		]);
	});

	it('says nothing about a run of two', () => {
		const entries = series('ana', ['win', 'win'], KICKOFF - 14 * DAY);

		expect(getStorylines(entries, ['ana'], { ana: settled }, KICKOFF)).toEqual([]);
	});

	it('does not count a shared first as part of a winning run', () => {
		const entries = series('ana', ['win', 'draw', 'win', 'win'], KICKOFF - 28 * DAY);

		expect(getStorylines(entries, ['ana'], { ana: settled }, KICKOFF)).toEqual([]);
	});

	it('tells a losing run of four', () => {
		const entries = series('joao', ['loss', 'loss', 'loss', 'loss'], KICKOFF - 28 * DAY);

		expect(getStorylines(entries, ['joao'], { joao: settled }, KICKOFF)).toEqual([
			{ kind: 'lossRun', uid: 'joao', count: 4 },
		]);
	});

	it('spots a player a point off a round rating', () => {
		const entries = series('ana', ['win', 'loss'], KICKOFF - 14 * DAY);

		expect(getStorylines(entries, ['ana'], { ana: rated(69) }, KICKOFF)).toEqual([
			{ kind: 'milestone', uid: 'ana', target: 70 },
		]);
	});

	it('does not count two points off as a milestone', () => {
		const entries = series('ana', ['win', 'loss'], KICKOFF - 14 * DAY);

		expect(getStorylines(entries, ['ana'], { ana: rated(68) }, KICKOFF)).toEqual([]);
	});

	it('gives an unrated player no milestone', () => {
		const entries = series('ana', ['win', 'loss'], KICKOFF - 14 * DAY);

		expect(getStorylines(entries, ['ana'], { ana: undefined }, KICKOFF)).toEqual([]);
	});

	it('marks a first game', () => {
		expect(getStorylines([], ['rui'], { rui: undefined }, KICKOFF)).toEqual([{ kind: 'debut', uid: 'rui' }]);
	});

	it('welcomes back a player away 30 days', () => {
		const entries = series('rui', ['win', 'loss'], KICKOFF - 37 * DAY);

		expect(getStorylines(entries, ['rui'], { rui: settled }, KICKOFF)).toEqual([
			{ kind: 'return', uid: 'rui', days: 30 },
		]);
	});

	it('does not count 27 days away as a return', () => {
		const entries = series('rui', ['win', 'loss'], KICKOFF - 34 * DAY);

		expect(getStorylines(entries, ['rui'], { rui: settled }, KICKOFF)).toEqual([]);
	});

	it('tells a man of the match run of two', () => {
		const entries = series('ana', ['loss', 'win'], KICKOFF - 14 * DAY).map(game => ({ ...game, motm: ['ana'] }));

		expect(getStorylines(entries, ['ana'], { ana: settled }, KICKOFF)).toEqual([
			{ kind: 'motmRun', uid: 'ana', count: 2 },
		]);
	});

	it('gives each player one storyline, the highest priority one', () => {
		const entries = series('ana', ['win', 'win', 'win'], KICKOFF - 21 * DAY);

		expect(getStorylines(entries, ['ana'], { ana: rated(69) }, KICKOFF)).toEqual([
			{ kind: 'winRun', uid: 'ana', count: 3 },
		]);
	});

	it('keeps three, by kind, then count, then uid', () => {
		const entries = [
			...series('bea', ['win', 'win', 'win'], KICKOFF - 21 * DAY),
			...series('ana', ['win', 'win', 'win', 'win'], KICKOFF - 28 * DAY),
			...series('caio', ['loss', 'loss', 'loss'], KICKOFF - 21 * DAY),
			...series('dora', ['win', 'loss'], KICKOFF - 14 * DAY),
		];
		const ratings = { ana: settled, bea: settled, caio: settled, dora: rated(69), eli: undefined };

		expect(getStorylines(entries, ['eli', 'dora', 'caio', 'bea', 'ana'], ratings, KICKOFF)).toEqual([
			{ kind: 'winRun', uid: 'ana', count: 4 },
			{ kind: 'winRun', uid: 'bea', count: 3 },
			{ kind: 'lossRun', uid: 'caio', count: 3 },
		]);
	});
});
