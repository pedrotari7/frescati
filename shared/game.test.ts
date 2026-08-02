import {
	getFormat,
	getGameLifecycle,
	getHeadcountState,
	getMinPlayers,
	getNoResponseCount,
	getResponseDeadline,
	getRole,
	isConfirmed,
	sortResponses,
	tallyResponses,
} from './game';
import type { Game, GameResponse, Season } from './types';
import { EMPTY_COUNTS } from './types';

const season = {
	minPlayers: 10,
	responseDeadlineHours: 24,
	memberUids: ['member-a', 'member-b'],
} as Season;

const game = {
	kickoff: '2026-09-01T17:00:00.000Z',
	endsAt: '2026-09-01T18:30:00.000Z',
	status: 'scheduled',
	counts: { ...EMPTY_COUNTS },
} as Game;

const response = (overrides: Partial<GameResponse>): GameResponse => ({
	uid: 'someone',
	status: 'in',
	role: 'extra',
	respondedAt: '2026-08-30T10:00:00.000Z',
	updatedAt: '2026-08-30T10:00:00.000Z',
	...overrides,
});

describe('getResponseDeadline', () => {
	it('subtracts the season deadline from kickoff', () => {
		expect(getResponseDeadline(game, season)).toBe('2026-08-31T17:00:00.000Z');
	});
});

describe('getGameLifecycle', () => {
	it.each([
		['2026-08-25T12:00:00Z', 'open'],
		['2026-08-31T18:00:00Z', 'locked'],
		['2026-09-01T17:30:00Z', 'live'],
		['2026-09-01T19:00:00Z', 'finished'],
	])('at %s the game is %s', (now, expected) => {
		expect(getGameLifecycle(game, season, new Date(now))).toBe(expected);
	});

	it('reports cancelled ahead of everything else', () => {
		expect(getGameLifecycle({ ...game, status: 'cancelled' }, season, new Date('2026-08-25T12:00:00Z'))).toBe(
			'cancelled'
		);
	});

	it('flips to live exactly at kickoff', () => {
		expect(getGameLifecycle(game, season, new Date(game.kickoff))).toBe('live');
	});

	it('flips to finished exactly at the final whistle', () => {
		expect(getGameLifecycle(game, season, new Date(game.endsAt))).toBe('finished');
	});
});

describe('getMinPlayers', () => {
	it('falls back to the season minimum', () => {
		expect(getMinPlayers(game, season)).toBe(10);
	});

	it('prefers a per-game override', () => {
		expect(getMinPlayers({ ...game, minPlayers: 14 }, season)).toBe(14);
	});

	it('honours an override of zero', () => {
		expect(getMinPlayers({ ...game, minPlayers: 0 }, season)).toBe(0);
	});
});

describe('getHeadcountState', () => {
	it('is at risk below the minimum', () => {
		expect(getHeadcountState({ ...game, counts: { ...EMPTY_COUNTS, playing: 9 } }, season)).toBe('at-risk');
	});

	it('is ready once the minimum is met', () => {
		expect(getHeadcountState({ ...game, counts: { ...EMPTY_COUNTS, playing: 10 } }, season)).toBe('ready');
	});
});

describe('getNoResponseCount', () => {
	it('counts members who have not answered', () => {
		expect(getNoResponseCount({ ...EMPTY_COUNTS, membersIn: 4, membersOut: 2 }, 12)).toBe(6);
	});

	it('never goes negative when the roster shrinks after responses land', () => {
		expect(getNoResponseCount({ ...EMPTY_COUNTS, membersIn: 8, membersOut: 2 }, 5)).toBe(0);
	});
});

describe('getFormat', () => {
	it.each([
		[7, null],
		[8, '4v4'],
		[10, '5v5'],
		[15, '7v7'],
		[20, '10v10'],
		[30, '11v11'],
	])('%i players is %s', (playing, expected) => {
		expect(getFormat(playing)).toBe(expected);
	});
});

describe('getRole', () => {
	it('recognises a season member', () => {
		expect(getRole('member-a', season)).toBe('member');
	});

	it('treats everyone else as an extra', () => {
		expect(getRole('stranger', season)).toBe('extra');
	});
});

describe('isConfirmed', () => {
	it('always confirms members', () => {
		expect(isConfirmed({ role: 'member', confirmOverride: false })).toBe(true);
	});

	it('leaves an extra unconfirmed until an admin says otherwise', () => {
		expect(isConfirmed({ role: 'extra' })).toBe(false);
	});

	it('confirms an extra an admin has waved through', () => {
		expect(isConfirmed({ role: 'extra', confirmOverride: true })).toBe(true);
	});

	it('respects an admin dropping an extra', () => {
		expect(isConfirmed({ role: 'extra', confirmOverride: false })).toBe(false);
	});
});

describe('sortResponses', () => {
	it('puts members first, then confirmed extras, then by signup time', () => {
		const sorted = sortResponses([
			response({ uid: 'extra-late', confirmOverride: true, respondedAt: '2026-08-30T12:00:00.000Z' }),
			response({ uid: 'extra-dropped', confirmOverride: false }),
			response({ uid: 'member-b', role: 'member', respondedAt: '2026-08-30T11:00:00.000Z' }),
			response({ uid: 'extra-early', confirmOverride: true, respondedAt: '2026-08-30T09:00:00.000Z' }),
			response({ uid: 'member-a', role: 'member', respondedAt: '2026-08-30T08:00:00.000Z' }),
		]);

		expect(sorted.map(r => r.uid)).toEqual(['member-a', 'member-b', 'extra-early', 'extra-late', 'extra-dropped']);
	});

	it('breaks exact ties by uid so every client agrees', () => {
		const sorted = sortResponses([response({ uid: 'zoe' }), response({ uid: 'adam' })]);

		expect(sorted.map(r => r.uid)).toEqual(['adam', 'zoe']);
	});

	it('does not mutate its input', () => {
		const input = [response({ uid: 'zoe' }), response({ uid: 'adam' })];
		sortResponses(input);

		expect(input.map(r => r.uid)).toEqual(['zoe', 'adam']);
	});
});

describe('tallyResponses', () => {
	it('counts an empty game as empty', () => {
		expect(tallyResponses([])).toEqual(EMPTY_COUNTS);
	});

	it('separates members from extras and totals who is playing', () => {
		const counts = tallyResponses([
			response({ role: 'member', status: 'in' }),
			response({ role: 'member', status: 'in' }),
			response({ role: 'member', status: 'out' }),
			response({ role: 'extra', status: 'in', confirmOverride: true }),
			response({ role: 'extra', status: 'in', confirmOverride: false }),
			response({ role: 'extra', status: 'out' }),
		]);

		expect(counts).toEqual({
			membersIn: 2,
			membersOut: 1,
			extrasIn: 2,
			extrasOut: 1,
			extrasConfirmed: 1,
			playing: 3,
		});
	});

	it('excludes an extra nobody has confirmed yet', () => {
		const counts = tallyResponses([response({ role: 'extra', status: 'in' })]);

		expect(counts.extrasIn).toBe(1);
		expect(counts.extrasConfirmed).toBe(0);
		expect(counts.playing).toBe(0);
	});

	it('excludes an extra who said out even if confirmed', () => {
		const counts = tallyResponses([response({ role: 'extra', status: 'out', confirmOverride: true })]);

		expect(counts.extrasConfirmed).toBe(0);
		expect(counts.playing).toBe(0);
	});
});
