import { addCivilDays, civilDateWeekday, parseCivilDate } from './datetime';
import type { Season } from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const civilDayNumber = (date: string): number => {
	const { year, month, day } = parseCivilDate(date);
	return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
};

/**
 * Dates for the season that follows `source`. It starts on the first slot
 * weekday strictly after the old end date, so a season ending on its own
 * weekday starts a week later and never the same day. It runs for as long as
 * the old one did.
 */
export const nextSeasonDates = (
	source: Pick<Season, 'startDate' | 'endDate' | 'slot'>
): { startDate: string; endDate: string } => {
	const lengthInDays = civilDayNumber(source.endDate) - civilDayNumber(source.startDate);
	const daysUntilNext = ((source.slot.weekday - civilDateWeekday(source.endDate) + 6) % 7) + 1;
	const startDate = addCivilDays(source.endDate, daysUntilNext);

	return { startDate, endDate: addCivilDays(startDate, lengthInDays) };
};

export type CopiedSettings = Pick<
	Season,
	| 'venue'
	| 'slot'
	| 'minPlayers'
	| 'responseDeadlineHours'
	| 'reminderHours'
	| 'balance'
	| 'fees'
	| 'adminUids'
	| 'copiedFrom'
>;

/**
 * What a copied season keeps from its source: where and when it plays, the
 * rules and the admins. Not the name, dates or status, and not the squad, which
 * has to sign up again. `balance` and `fees` are left out when the source has
 * none, because Firestore rejects `undefined`.
 */
export const copySeasonSettings = (source: Season, creatorUid: string): CopiedSettings => ({
	venue: source.venue,
	slot: source.slot,
	minPlayers: source.minPlayers,
	responseDeadlineHours: source.responseDeadlineHours,
	reminderHours: source.reminderHours,
	...(source.balance && { balance: source.balance }),
	...(source.fees && { fees: source.fees }),
	adminUids: [creatorUid, ...source.adminUids.filter(uid => uid !== creatorUid)],
	copiedFrom: source.id,
});
