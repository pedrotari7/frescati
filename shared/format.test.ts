import {
	byDisplayName,
	counted,
	formatCivilDate,
	formatGameDate,
	formatGameTime,
	formatGameWhen,
	formatRelative,
	initials,
	placeLabel,
	plural,
	signed,
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
	it('builds initials from the first two names', () => {
		expect(initials('Pedro Miguel Alvito')).toBe('PM');
	});

	it('builds initials from a single name', () => {
		expect(initials('Ronaldinho')).toBe('R');
	});
});

describe('byDisplayName', () => {
	it('sorts people alphabetically', () => {
		const sorted = [{ displayName: 'Pedro' }, { displayName: 'Anna' }, { displayName: 'Marco' }].sort(
			byDisplayName
		);

		expect(sorted.map(person => person.displayName)).toEqual(['Anna', 'Marco', 'Pedro']);
	});

	// A profile mid-write has no name yet. It has to sort somewhere rather than
	// throw — that is the whole reason `subscribeToUsers` sorts in the client.
	it('keeps a nameless profile in the list', () => {
		const sorted = [{ displayName: 'Anna' }, {}].sort(byDisplayName);

		expect(sorted).toEqual([{}, { displayName: 'Anna' }]);
	});
});

describe('plural', () => {
	it('picks the singular for exactly one', () => {
		expect(plural(1, 'game')).toBe('game');
	});

	it.each([0, 2, 11])('picks the plural for %i', count => {
		expect(plural(count, 'game')).toBe('games');
	});

	it('takes an irregular plural', () => {
		expect(plural(1, 'person', 'people')).toBe('person');
		expect(plural(3, 'person', 'people')).toBe('people');
	});

	it('handles a verb agreement, which is the same problem', () => {
		expect(plural(1, 'says', 'say')).toBe('says');
		expect(plural(2, 'says', 'say')).toBe('say');
	});
});

describe('signed', () => {
	it('adds a plus only to a positive', () => {
		expect(signed(6)).toBe('+6');
		expect(signed(-6)).toBe('-6');
		expect(signed(0)).toBe('0');
	});
});

describe('counted', () => {
	it('puts the count in front of the word', () => {
		expect(counted(1, 'game')).toBe('1 game');
		expect(counted(3, 'game')).toBe('3 games');
		expect(counted(0, 'game')).toBe('0 games');
	});

	it('carries an irregular plural through', () => {
		expect(counted(2, 'person', 'people')).toBe('2 people');
	});
});

describe('placeLabel', () => {
	it.each([
		[0, '1st'],
		[1, '2nd'],
		[2, '3rd'],
		[3, '4th'],
	])('renders position %i as "%s"', (position, expected) => {
		expect(placeLabel(position)).toBe(expected);
	});

	it('marks a place two teams share', () => {
		expect(placeLabel(0, true)).toBe('=1st');
	});

	it('still renders something past the four-team ceiling', () => {
		expect(placeLabel(4)).toBe('5th');
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
