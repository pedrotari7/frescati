import { addCivilDays, civilDateWeekday, parseClockTime, zonedTimeToUtc } from './datetime';
import { diffGeneratedGames, generateGameDates } from './schedule';
import type { SeasonSlot } from './types';

const stockholmTuesdays: SeasonSlot = {
	weekday: 2,
	time: '19:00',
	durationMinutes: 90,
	timezone: 'Europe/Stockholm',
};

describe('zonedTimeToUtc', () => {
	it('resolves a summer wall-clock time at UTC+2', () => {
		expect(zonedTimeToUtc(2026, 7, 7, 19, 0, 'Europe/Stockholm').toISOString()).toBe('2026-07-07T17:00:00.000Z');
	});

	it('resolves a winter wall-clock time at UTC+1', () => {
		expect(zonedTimeToUtc(2026, 1, 6, 19, 0, 'Europe/Stockholm').toISOString()).toBe('2026-01-06T18:00:00.000Z');
	});

	it('handles the evening of the spring-forward day', () => {
		// Sweden springs forward at 02:00 on 2026-03-29, so 19:00 that day is UTC+2.
		expect(zonedTimeToUtc(2026, 3, 29, 19, 0, 'Europe/Stockholm').toISOString()).toBe('2026-03-29T17:00:00.000Z');
	});

	it('handles the evening of the fall-back day', () => {
		// Clocks go back at 03:00 on 2026-10-25, so 19:00 that day is UTC+1.
		expect(zonedTimeToUtc(2026, 10, 25, 19, 0, 'Europe/Stockholm').toISOString()).toBe('2026-10-25T18:00:00.000Z');
	});

	it('is a no-op for UTC itself', () => {
		expect(zonedTimeToUtc(2026, 7, 7, 19, 0, 'UTC').toISOString()).toBe('2026-07-07T19:00:00.000Z');
	});
});

describe('civil date helpers', () => {
	it('reads the weekday of a civil date', () => {
		expect(civilDateWeekday('2026-09-01')).toBe(2); // a Tuesday
		expect(civilDateWeekday('2026-09-06')).toBe(0); // a Sunday
	});

	it('advances across a month boundary', () => {
		expect(addCivilDays('2026-09-29', 7)).toBe('2026-10-06');
	});

	it('advances across a leap day', () => {
		expect(addCivilDays('2028-02-28', 1)).toBe('2028-02-29');
	});

	it('rejects a malformed time', () => {
		expect(() => parseClockTime('7:00')).toThrow();
		expect(() => parseClockTime('25:00')).toThrow();
	});
});

describe('generateGameDates', () => {
	it('generates every matching weekday in the range', () => {
		const games = generateGameDates(stockholmTuesdays, '2026-09-01', '2026-09-30');

		expect(games.map(g => g.kickoff)).toEqual([
			'2026-09-01T17:00:00.000Z',
			'2026-09-08T17:00:00.000Z',
			'2026-09-15T17:00:00.000Z',
			'2026-09-22T17:00:00.000Z',
			'2026-09-29T17:00:00.000Z',
		]);
	});

	it('keeps 19:00 local across the autumn DST change', () => {
		const games = generateGameDates(stockholmTuesdays, '2026-10-20', '2026-11-03');

		// 20 Oct is still summer time (UTC+2); 27 Oct and 3 Nov are winter (UTC+1).
		expect(games.map(g => g.kickoff)).toEqual([
			'2026-10-20T17:00:00.000Z',
			'2026-10-27T18:00:00.000Z',
			'2026-11-03T18:00:00.000Z',
		]);
	});

	it('starts on the range start when it already falls on the slot weekday', () => {
		const games = generateGameDates(stockholmTuesdays, '2026-09-01', '2026-09-08');

		expect(games).toHaveLength(2);
		expect(games[0].kickoff).toBe('2026-09-01T17:00:00.000Z');
	});

	it('includes a game landing exactly on the end date', () => {
		const games = generateGameDates(stockholmTuesdays, '2026-09-02', '2026-09-08');

		expect(games.map(g => g.kickoff)).toEqual(['2026-09-08T17:00:00.000Z']);
	});

	it('applies the slot duration to endsAt', () => {
		const [game] = generateGameDates(stockholmTuesdays, '2026-09-01', '2026-09-01');

		expect(game.endsAt).toBe('2026-09-01T18:30:00.000Z');
	});

	it('returns nothing when the range contains no matching weekday', () => {
		expect(generateGameDates(stockholmTuesdays, '2026-09-02', '2026-09-07')).toEqual([]);
	});

	it('returns nothing when the range is inverted', () => {
		expect(generateGameDates(stockholmTuesdays, '2026-09-30', '2026-09-01')).toEqual([]);
	});

	it('caps runaway ranges', () => {
		expect(generateGameDates(stockholmTuesdays, '2026-01-01', '2099-01-01')).toHaveLength(200);
	});
});

describe('diffGeneratedGames', () => {
	it('separates new kickoffs from ones already stored', () => {
		const generated = generateGameDates(stockholmTuesdays, '2026-09-01', '2026-09-15');
		const { toCreate, alreadyExisting } = diffGeneratedGames(generated, ['2026-09-08T17:00:00.000Z']);

		expect(toCreate.map(g => g.kickoff)).toEqual(['2026-09-01T17:00:00.000Z', '2026-09-15T17:00:00.000Z']);
		expect(alreadyExisting.map(g => g.kickoff)).toEqual(['2026-09-08T17:00:00.000Z']);
	});

	it('treats an empty store as all-new', () => {
		const generated = generateGameDates(stockholmTuesdays, '2026-09-01', '2026-09-15');

		expect(diffGeneratedGames(generated, []).toCreate).toHaveLength(3);
	});
});
