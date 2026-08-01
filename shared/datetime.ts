/**
 * Timezone helpers built on `Intl.DateTimeFormat` — no dependencies, works
 * identically in Node and the browser.
 *
 * We need these because a season slot is a *wall-clock* time ("every Tuesday at
 * 19:00 in Stockholm"), and Stockholm is UTC+1 in winter and UTC+2 in summer.
 * Adding a fixed offset would silently shift half the season by an hour.
 */

const partsCache = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
	let formatter = partsCache.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hour12: false,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
		partsCache.set(timeZone, formatter);
	}
	return formatter;
};

/** The zone's UTC offset in milliseconds *at the given instant*. */
export const getTimezoneOffsetMs = (instant: Date, timeZone: string): number => {
	const parts = formatterFor(timeZone).formatToParts(instant);
	const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value ?? 0);

	// Some ICU builds render midnight as hour 24 under hour12:false.
	const asIfUtc = Date.UTC(
		read('year'),
		read('month') - 1,
		read('day'),
		read('hour') % 24,
		read('minute'),
		read('second')
	);

	// The formatter has no millisecond field, so compare against a whole second.
	return asIfUtc - (instant.getTime() - instant.getUTCMilliseconds());
};

/**
 * Convert a wall-clock time in `timeZone` to the UTC instant it refers to.
 *
 * Resolved iteratively: guess the offset from the naive instant, correct, then
 * re-check — a second pass is what makes DST-boundary days come out right.
 */
export const zonedTimeToUtc = (
	year: number,
	month: number,
	day: number,
	hours: number,
	minutes: number,
	timeZone: string
): Date => {
	const naive = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);

	const firstOffset = getTimezoneOffsetMs(new Date(naive), timeZone);
	const firstGuess = naive - firstOffset;

	const secondOffset = getTimezoneOffsetMs(new Date(firstGuess), timeZone);

	return new Date(secondOffset === firstOffset ? firstGuess : naive - secondOffset);
};

export interface ZonedParts {
	year: number;
	month: number;
	day: number;
	hours: number;
	minutes: number;
	/** 0 = Sunday … 6 = Saturday. */
	weekday: number;
}

/**
 * Break an instant into its wall-clock parts in `timeZone`.
 *
 * Callers compose their own strings from these rather than asking Intl to
 * render text, because ICU's abbreviations drift between Node and browser
 * versions ("Sep" vs "Sept") and we want the same output everywhere.
 */
export const getZonedParts = (iso: string, timeZone: string): ZonedParts => {
	const instant = new Date(iso);
	const parts = formatterFor(timeZone).formatToParts(instant);
	const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value ?? 0);

	const year = read('year');
	const month = read('month');
	const day = read('day');

	return {
		year,
		month,
		day,
		hours: read('hour') % 24,
		minutes: read('minute'),
		weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
	};
};

/** Parse a `YYYY-MM-DD` civil date into its parts. Throws on anything else. */
export const parseCivilDate = (date: string): { year: number; month: number; day: number } => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!match) throw new Error(`Expected a YYYY-MM-DD date, got "${date}"`);

	return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

/** Parse an `HH:mm` wall-clock time into its parts. Throws on anything else. */
export const parseClockTime = (time: string): { hours: number; minutes: number } => {
	const match = /^(\d{2}):(\d{2})$/.exec(time);
	if (!match) throw new Error(`Expected an HH:mm time, got "${time}"`);

	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) throw new Error(`"${time}" is not a valid time of day`);

	return { hours, minutes };
};

/**
 * Weekday of a civil date, 0 = Sunday. Timezone-independent: a calendar date
 * falls on the same weekday everywhere.
 */
export const civilDateWeekday = (date: string): number => {
	const { year, month, day } = parseCivilDate(date);
	return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

/** Advance a `YYYY-MM-DD` civil date by whole days. */
export const addCivilDays = (date: string, days: number): string => {
	const { year, month, day } = parseCivilDate(date);
	const shifted = new Date(Date.UTC(year, month - 1, day + days));

	return shifted.toISOString().slice(0, 10);
};

export const addHours = (iso: string, hours: number): string =>
	new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();

export const addMinutes = (iso: string, minutes: number): string =>
	new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
