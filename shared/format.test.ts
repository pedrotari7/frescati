import {
	formatCivilDate,
	formatGameDate,
	formatGameTime,
	formatGameWhen,
	formatRelative,
	initials,
	shortName,
	weekdayName,
} from './format';

const STOCKHOLM = 'Europe/Stockholm';

describe('weekdayName', () => {
	it('names a weekday', () => {
		expect(weekdayName(2)).toBe('Tuesday');
	});

	it('is empty for a nonsense index', () => {
		expect(weekdayName(9)).toBe('');
	});
});

describe('game date and time formatting', () => {
	it('renders a summer kickoff in local time', () => {
		expect(formatGameDate('2026-09-01T17:00:00.000Z', STOCKHOLM)).toBe('Tue 1 Sep');
		expect(formatGameTime('2026-09-01T17:00:00.000Z', STOCKHOLM)).toBe('19:00');
	});

	it('renders a winter kickoff in local time', () => {
		expect(formatGameTime('2026-11-03T18:00:00.000Z', STOCKHOLM)).toBe('19:00');
	});

	it('combines date and time', () => {
		expect(formatGameWhen('2026-09-01T17:00:00.000Z', STOCKHOLM)).toBe('Tue 1 Sep · 19:00');
	});

	it('rolls over to the next local day when UTC and local disagree', () => {
		// 22:30 UTC on the 1st is 00:30 on the 2nd in Stockholm.
		expect(formatGameDate('2026-09-01T22:30:00.000Z', STOCKHOLM)).toBe('Wed 2 Sep');
	});
});

describe('formatCivilDate', () => {
	it('renders a bare civil date with no timezone conversion', () => {
		expect(formatCivilDate('2026-09-01')).toBe('Tue 1 Sep');
	});

	it('throws on a malformed date', () => {
		expect(() => formatCivilDate('01-09-2026')).toThrow();
	});
});

describe('name helpers', () => {
	it('takes the first name only', () => {
		expect(shortName('Pedro Alvito')).toBe('Pedro');
	});

	it('leaves a single name alone', () => {
		expect(shortName('Ronaldinho')).toBe('Ronaldinho');
	});

	it('builds initials from the first two names', () => {
		expect(initials('Pedro Miguel Alvito')).toBe('PM');
	});

	it('builds initials from a single name', () => {
		expect(initials('Ronaldinho')).toBe('R');
	});
});

describe('formatRelative', () => {
	const now = new Date('2026-09-01T12:00:00.000Z');

	it.each([
		['2026-09-01T12:30:00.000Z', 'in 30 minutes'],
		['2026-09-01T11:30:00.000Z', '30 minutes ago'],
		['2026-09-01T17:00:00.000Z', 'in 5 hours'],
		['2026-09-04T12:00:00.000Z', 'in 3 days'],
		['2026-09-22T12:00:00.000Z', 'in 3 weeks'],
	])('renders %s as "%s"', (iso, expected) => {
		expect(formatRelative(iso, now)).toBe(expected);
	});

	it('uses the friendly form for tomorrow', () => {
		expect(formatRelative('2026-09-02T12:00:00.000Z', now)).toBe('tomorrow');
	});
});
