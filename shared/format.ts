import { civilDateWeekday, getZonedParts, parseCivilDate } from './datetime';

/**
 * Presentation helpers shared by the app and the push notification copy.
 *
 * Dates are composed from our own name tables rather than `Intl`'s rendered
 * text: ICU abbreviations differ between Node and browser versions ("Sep" vs
 * "Sept"), and a notification should read the same as the screen that sent it.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export const weekdayName = (weekday: number): string => WEEKDAYS[weekday] ?? '';

export const weekdayShort = (weekday: number): string => WEEKDAYS_SHORT[weekday] ?? '';

const pad = (value: number): string => String(value).padStart(2, '0');

/** `Tue 1 Sep` */
export const formatGameDate = (iso: string, timeZone: string): string => {
	const { weekday, day, month } = getZonedParts(iso, timeZone);

	return `${weekdayShort(weekday)} ${day} ${MONTHS_SHORT[month - 1]}`;
};

/** `Tuesday 1 September` — for headings where the short form reads too terse. */
export const formatGameDateLong = (iso: string, timeZone: string): string => {
	const { weekday, day, month } = getZonedParts(iso, timeZone);

	return `${weekdayName(weekday)} ${day} ${MONTHS_SHORT[month - 1]}`;
};

/** `Tue 1 Sep` — a bare `YYYY-MM-DD` civil date, no timezone conversion involved. */
export const formatCivilDate = (date: string): string => {
	const { month, day } = parseCivilDate(date);
	return `${weekdayShort(civilDateWeekday(date))} ${day} ${MONTHS_SHORT[month - 1]}`;
};

/** `19:00` */
export const formatGameTime = (iso: string, timeZone: string): string => {
	const { hours, minutes } = getZonedParts(iso, timeZone);

	return `${pad(hours)}:${pad(minutes)}`;
};

/** `Tue 1 Sep · 19:00` */
export const formatGameWhen = (iso: string, timeZone: string): string =>
	`${formatGameDate(iso, timeZone)} · ${formatGameTime(iso, timeZone)}`;

/**
 * Four teams is the ceiling everywhere in the app, so four places is all there
 * ever is. The fallback exists only so a nonsense index renders something.
 */
const ORDINALS = ['1st', '2nd', '3rd', '4th'];

/**
 * A 0-indexed finishing place, as people read it.
 *
 * `shared` prefixes an `=`, because teams nothing could separate genuinely
 * finished level — promoting one of them would be inventing a result.
 */
export const placeLabel = (position: number, shared = false): string =>
	`${shared ? '=' : ''}${ORDINALS[position] ?? `${position + 1}th`}`;

export const initials = (displayName: string): string =>
	displayName
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map(part => part[0]?.toUpperCase() ?? '')
		.join('');

/**
 * `in 3 days`, `in 2 hours`, `5 minutes ago`. Coarse on purpose — nobody needs
 * seconds of precision to decide whether they're playing on Tuesday.
 */
export const formatRelative = (iso: string, now: Date = new Date()): string => {
	const diffMs = new Date(iso).getTime() - now.getTime();
	const formatter = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });

	const minutes = Math.round(diffMs / 60_000);
	if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');

	const hours = Math.round(diffMs / 3_600_000);
	if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');

	const days = Math.round(diffMs / 86_400_000);
	if (Math.abs(days) < 7) return formatter.format(days, 'day');

	return formatter.format(Math.round(days / 7), 'week');
};
