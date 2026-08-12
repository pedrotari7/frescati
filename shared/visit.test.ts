import { DORMANT_DAYS, RECENT_DAYS, VISIT_GAP_MS, byLastSeen, isNewVisit, visitRecency } from './visit';

describe('isNewVisit', () => {
	const now = new Date('2026-08-12T19:00:00.000Z');
	const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

	it('counts somebody with no stamp at all as a new visit', () => {
		expect(isNewVisit(undefined, now)).toBe(true);
	});

	it('treats a flick to another tab and back as the same visit', () => {
		expect(isNewVisit(ago(30_000), now)).toBe(false);
	});

	it('counts coming back after the gap as a new visit', () => {
		expect(isNewVisit(ago(VISIT_GAP_MS + 1), now)).toBe(true);
	});

	// The boundary belongs to the new visit: a gap that has fully elapsed has
	// elapsed, and rounding it the other way would need a strictly longer wait.
	it('counts the gap itself as elapsed', () => {
		expect(isNewVisit(ago(VISIT_GAP_MS), now)).toBe(true);
	});

	// A device whose clock was ahead when it wrote. Left as "recent", the field
	// would refuse to move until real time caught up.
	it('replaces a stamp from the future', () => {
		expect(isNewVisit(new Date(now.getTime() + 86_400_000).toISOString(), now)).toBe(true);
	});

	it('replaces a stamp it cannot read', () => {
		expect(isNewVisit('last tuesday', now)).toBe(true);
	});

	it('honours a caller-supplied gap', () => {
		expect(isNewVisit(ago(60_000), now, 30_000)).toBe(true);
		expect(isNewVisit(ago(60_000), now, 120_000)).toBe(false);
	});
});

describe('visitRecency', () => {
	const now = new Date('2026-08-12T19:00:00.000Z');
	const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

	it('sorts a visit into the week it belongs to', () => {
		expect(visitRecency(daysAgo(0), now)).toBe('thisWeek');
		expect(visitRecency(daysAgo(RECENT_DAYS - 1), now)).toBe('thisWeek');
		expect(visitRecency(daysAgo(RECENT_DAYS), now)).toBe('thisMonth');
		expect(visitRecency(daysAgo(DORMANT_DAYS - 1), now)).toBe('thisMonth');
		expect(visitRecency(daysAgo(DORMANT_DAYS), now)).toBe('dormant');
		expect(visitRecency(daysAgo(400), now)).toBe('dormant');
	});

	// A profile `set-admin` created from a uid alone has never been opened by
	// anybody. That is a state of its own, not a very old visit.
	it('separates never opened from opened long ago', () => {
		expect(visitRecency(undefined, now)).toBe('never');
	});

	// Hiding somebody behind a date we can't read would be the worst outcome:
	// this screen exists to show who has gone missing.
	it('counts a stamp it cannot read as never', () => {
		expect(visitRecency('some time in july', now)).toBe('never');
	});

	it('puts a clock that ran ahead in the current week', () => {
		expect(visitRecency(daysAgo(-2), now)).toBe('thisWeek');
	});
});

describe('byLastSeen', () => {
	const order = (users: { lastSeenAt?: string }[]) => [...users].sort(byLastSeen).map(u => u.lastSeenAt ?? 'never');

	it('puts the most recent first and the never-seen last', () => {
		expect(
			order([
				{ lastSeenAt: '2026-01-01T00:00:00.000Z' },
				{},
				{ lastSeenAt: '2026-08-12T00:00:00.000Z' },
				{ lastSeenAt: '2026-05-01T00:00:00.000Z' },
			])
		).toEqual(['2026-08-12T00:00:00.000Z', '2026-05-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'never']);
	});

	// Two unknowns subtracting to `NaN` would leave the sort undefined for the
	// whole list, not just for the pair being compared.
	it('leaves two never-seen players in a defined order', () => {
		expect(order([{}, { lastSeenAt: 'nonsense' }, {}])).toEqual(['never', 'nonsense', 'never']);
	});
});
