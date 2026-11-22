import { copySeasonSettings, nextSeasonDates } from './seasonCopy';
import type { Season, SeasonSlot } from './types';

const tuesday: SeasonSlot = { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'Europe/Stockholm' };

const source: Season = {
	id: 'autumn',
	name: 'Autumn',
	status: 'active',
	startDate: '2026-08-18',
	endDate: '2026-12-15',
	venue: { name: 'Frescati IP' } as Season['venue'],
	slot: tuesday,
	minPlayers: 10,
	responseDeadlineHours: 2,
	reminderHours: [24],
	memberUids: ['a', 'b'],
	adminUids: ['a', 'b'],
	createdAt: '2026-08-01T00:00:00.000Z',
	createdBy: 'a',
	signupClosesOn: '2026-08-10',
	confirmedAt: '2026-08-11T00:00:00.000Z',
	confirmedBy: 'a',
	quiet: true,
};

describe('nextSeasonDates', () => {
	it('starts on the next slot weekday after the old end and keeps the old length', () => {
		expect(nextSeasonDates({ startDate: '2026-08-18', endDate: '2026-12-15', slot: tuesday })).toEqual({
			startDate: '2026-12-22',
			endDate: '2027-04-20',
		});
	});

	it('starts a week later, not the same day, when the old end is the slot weekday', () => {
		const { startDate } = nextSeasonDates({ startDate: '2026-12-01', endDate: '2026-12-15', slot: tuesday });
		expect(startDate).toBe('2026-12-22');
	});

	it('finds the weekday when the old end falls on another day', () => {
		const { startDate } = nextSeasonDates({ startDate: '2026-12-01', endDate: '2026-12-16', slot: tuesday });
		expect(startDate).toBe('2026-12-22');
	});
});

describe('copySeasonSettings', () => {
	it('records the source id as copiedFrom', () => {
		expect(copySeasonSettings(source, 'c').copiedFrom).toBe('autumn');
	});

	it('puts the creator first in adminUids without duplicating them', () => {
		expect(copySeasonSettings(source, 'c').adminUids).toEqual(['c', 'a', 'b']);
		expect(copySeasonSettings(source, 'b').adminUids).toEqual(['b', 'a']);
	});

	it('omits fees and balance when the source has none', () => {
		const result = copySeasonSettings(source, 'a');
		expect('fees' in result).toBe(false);
		expect('balance' in result).toBe(false);
	});

	it('keeps fees and balance when the source has them', () => {
		const fees = { total: 1000 } as Season['fees'];
		const balance = {} as Season['balance'];
		const result = copySeasonSettings({ ...source, fees, balance }, 'a');
		expect(result.fees).toBe(fees);
		expect(result.balance).toBe(balance);
	});

	it('never carries identity, dates, squad or sign-up state', () => {
		const result = copySeasonSettings(source, 'a');
		for (const key of [
			'name',
			'startDate',
			'endDate',
			'memberUids',
			'status',
			'quiet',
			'signupClosesOn',
			'confirmedAt',
			'confirmedBy',
		]) {
			expect(key in result).toBe(false);
		}
	});
});

describe('copySeasonSettings, payees', () => {
	const copied = (payees: NonNullable<NonNullable<Season['fees']>['payees']>) =>
		copySeasonSettings({ ...source, fees: { total: 1000, perGame: 50, payees } }, 'a').fees?.payees;

	it('keeps who an admin pot names and drops the number copied in beside it', () => {
		expect(copied({ entry: { uid: 'a', swish: '0701' }, extras: { uid: 'b' } })).toEqual({
			entry: { uid: 'a' },
			extras: { uid: 'b' },
		});
	});

	it('leaves a custom number alone', () => {
		expect(copied({ entry: { swish: '0705' } })).toEqual({ entry: { swish: '0705' } });
	});

	it('does not mutate the source', () => {
		const fees = { total: 1000, perGame: 50, payees: { entry: { uid: 'a', swish: '0701' } } };
		copySeasonSettings({ ...source, fees }, 'a');
		expect(fees.payees.entry.swish).toBe('0701');
	});
});
