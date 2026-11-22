import { planConfirmation, signupReminderDue, signupShare } from './signup';
import type { KitItem, Season, Signup } from './types';

const signup = (uid: string, status: Signup['status']): Signup => ({
	uid,
	status,
	answeredAt: '2026-08-02T10:00:00.000Z',
	updatedAt: '2026-08-02T10:00:00.000Z',
});

const kit = (id: string, holderUid: string): KitItem => ({
	id,
	name: `Item ${id}`,
	kind: 'ball',
	holderUid,
	updatedBy: 'old',
	updatedAt: '2026-01-01T00:00:00.000Z',
});

const yeses = (n: number): Signup[] => Array.from({ length: n }, (_, i) => signup(`p${i}`, 'yes'));

describe('planConfirmation', () => {
	it('makes the yes answers the members, sorted, and ignores the no answers', () => {
		const plan = planConfirmation(
			[signup('c', 'yes'), signup('x', 'no'), signup('a', 'yes')],
			{ adminUids: [] },
			[],
			'a'
		);
		expect(plan.memberUids).toEqual(['a', 'c']);
	});

	it('keeps the admins who are members and demotes the rest', () => {
		const plan = planConfirmation(
			[signup('a', 'yes'), signup('c', 'yes')],
			{ adminUids: ['z', 'c', 'a', 'y'] },
			[],
			'a'
		);
		expect(plan.adminUids).toEqual(['c', 'a']);
		expect(plan.demotedAdminUids).toEqual(['z', 'y']);
	});

	it('does not add a confirmer who was not an admin', () => {
		const plan = planConfirmation([signup('a', 'yes'), signup('b', 'yes')], { adminUids: ['a'] }, [], 'b');
		expect(plan.adminUids).toEqual(['a']);
	});

	it('makes the confirmer the admin when none of the old admins said yes', () => {
		const plan = planConfirmation([signup('a', 'yes'), signup('b', 'yes')], { adminUids: ['z'] }, [], 'b');
		expect(plan.adminUids).toEqual(['b']);
		expect(plan.demotedAdminUids).toEqual(['z']);
	});

	it('splits the bill across the yes answers and raises one entry charge each', () => {
		const plan = planConfirmation(yeses(18), { adminUids: [], fees: { total: 31240, perGame: 0 } }, [], 'p0');
		expect(plan.share).toBe(1736);
		expect(plan.dues).toHaveLength(18);
		expect(plan.dues[0]).toEqual({ id: 'entry_p0', uid: 'p0', kind: 'entry', amount: 1736 });
	});

	it('raises nothing when the bill is zero or there are no fees', () => {
		for (const fees of [{ total: 0, perGame: 0 }, undefined]) {
			const plan = planConfirmation(yeses(3), { adminUids: [], fees }, [], 'p0');
			expect(plan.dues).toEqual([]);
			expect(plan.share).toBe(0);
		}
	});

	it('leaves kit with its holder when they are a member and hands the rest to the confirmer', () => {
		const plan = planConfirmation(
			[signup('a', 'yes'), signup('b', 'yes')],
			{ adminUids: [] },
			[kit('1', 'b'), kit('2', 'gone')],
			'a'
		);
		expect(plan.kit).toEqual([
			{ name: 'Item 1', kind: 'ball', holderUid: 'b', updatedBy: 'a' },
			{ name: 'Item 2', kind: 'ball', holderUid: 'a', updatedBy: 'a' },
		]);
	});
});

describe('signupShare', () => {
	it('is zero for nobody rather than a division by zero', () => {
		expect(signupShare({ fees: { total: 31240, perGame: 0 } }, 0)).toBe(0);
	});

	it('rounds a share up', () => {
		expect(signupShare({ fees: { total: 31240, perGame: 0 } }, 18)).toBe(1736);
	});
});

describe('signupReminderDue', () => {
	const draft: Pick<Season, 'status' | 'quiet' | 'signupClosesOn' | 'createdAt' | 'slot'> = {
		status: 'draft',
		createdAt: '2026-08-01T08:00:00.000Z',
		slot: { weekday: 2, time: '19:00', timezone: 'Europe/Stockholm', durationMinutes: 60 },
	};
	const onDay = (day: number, hour = 12) => new Date(Date.UTC(2026, 7, 1 + day, hour));

	it('is false for a season that is already active', () => {
		expect(signupReminderDue({ ...draft, status: 'active' }, onDay(3))).toBe(false);
	});

	it('is false for a quiet season', () => {
		expect(signupReminderDue({ ...draft, quiet: true }, onDay(3))).toBe(false);
	});

	it('is false the day after the close date and true on it', () => {
		const closing = { ...draft, signupClosesOn: '2026-08-07' };
		expect(signupReminderDue(closing, onDay(6))).toBe(true);
		expect(signupReminderDue({ ...closing, signupClosesOn: '2026-08-06' }, onDay(6))).toBe(false);
	});

	it('is true on day 3 and day 6 at any hour', () => {
		for (const hour of [0, 6, 12, 21]) {
			expect(signupReminderDue(draft, onDay(3, hour))).toBe(true);
			expect(signupReminderDue(draft, onDay(6, hour))).toBe(true);
		}
	});

	it('is false on days 0, 1, 2, 4 and 5', () => {
		for (const day of [0, 1, 2, 4, 5]) expect(signupReminderDue(draft, onDay(day))).toBe(false);
	});

	it('counts days in the season timezone, not UTC', () => {
		// 22:30 UTC on day 2 is already day 3 in Stockholm (UTC+2 in August).
		expect(signupReminderDue(draft, new Date(Date.UTC(2026, 7, 3, 22, 30)))).toBe(true);
	});
});
