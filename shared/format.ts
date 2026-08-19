import { civilDateWeekday, getZonedParts, parseCivilDate } from './datetime';
import type { SeasonStatus } from './types';

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
 * Sort people by the name they're shown under.
 *
 * Structurally typed rather than taking an `AppUser`, because half the callers
 * sort a row they have already built — a uid, a name and an avatar — rather
 * than the profile it came from.
 *
 * The `?? ''` is not defensive padding: a profile can genuinely be missing a
 * `displayName` mid-write, and `subscribeToUsers` sorts here precisely so that
 * one sorts to the top looking incomplete rather than vanishing, which is what
 * `orderBy('displayName')` would have done to it.
 */
export const byDisplayName = (a: { displayName?: string }, b: { displayName?: string }): number =>
	(a.displayName ?? '').localeCompare(b.displayName ?? '');

/**
 * The right form of a word for a count — `plural(1, 'game')` is `game`, and
 * `plural(2, 'game')` is `games`.
 *
 * The third argument is for the words that don't take an `s`: `person`/`people`,
 * `entry`/`entries`, and the verb agreements a script's summary line needs
 * (`says`/`say`). Without it every one of those stays hand-written, which is
 * where the fourteen copies of `${n === 1 ? '' : 's'}` came from in the first
 * place.
 *
 * Only the count's *number* is read, so this says nothing about zero: "0 games"
 * is plural in English and falls out of the `=== 1` test on its own.
 */
export const plural = (count: number, singular: string, many = `${singular}s`): string =>
	count === 1 ? singular : many;

/** `3 games`, `1 game` — the count and its word, which is how most of them read. */
export const counted = (count: number, singular: string, many?: string): string =>
	`${count} ${plural(count, singular, many)}`;

/**
 * `+6`, `-6`, `0` — a number carrying its sign, the way a scoreboard writes a
 * change rather than a quantity.
 *
 * Negatives already have theirs and zero gets none, so this is only ever adding
 * the `+`. Worth a name anyway: it is the one piece the three rating-movement
 * renderers genuinely share, and each had written the ternary out.
 */
export const signed = (value: number): string => (value > 0 ? `+${value}` : `${value}`);

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

/**
 * A season's status in the words the app writes it in.
 *
 * The season picker printed the stored value straight into a pill — "active",
 * lowercase, the only place in the app where a pill showed a database value
 * rather than copy — while the settings form eight lines of markup away had the
 * same three capitalised in its own `<option>` labels. One table, so the screen
 * that shows a status and the screen that sets it can't disagree about what it
 * is called.
 */
export const SEASON_STATUS_LABELS: Record<SeasonStatus, string> = {
	draft: 'Draft',
	active: 'Active',
	archived: 'Archived',
};
