import type { Game, Season } from './types';

/**
 * Builds the iCalendar (RFC 5545) text for a season's subscribable feed.
 *
 * Pure and deterministic given the same inputs — the actual freshness comes
 * from the caller re-running this against current Firestore state on every
 * fetch, not from anything stateful in here. `calendarFeed` in the backend is
 * the only caller; this exists separately so the format itself is unit-tested
 * without an emulator.
 *
 * Deliberately excludes response counts and rosters. The link this feed is
 * served from doesn't require signing in — see `calendarFeed.ts` — so nothing
 * goes in here beyond what a game's own screen already shows to a stranger
 * with the URL: when, where, and whether it's still on.
 */

const CRLF = '\r\n';

/** RFC 5545 §3.3.11 — these four characters need a backslash in TEXT values. */
const escapeText = (value: string): string =>
	value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/**
 * Folds a line at 75 octets as RFC 5545 §3.1 requires, continuing on the next
 * line with a single leading space. Splits on UTF-16 code units rather than
 * bytes — good enough here since venue names and notes are typically ASCII,
 * and a slightly-early fold on a multibyte character costs nothing a reader
 * would notice.
 */
const foldLine = (line: string): string => {
	if (line.length <= 75) return line;

	const parts: string[] = [];
	let rest = line;

	while (rest.length > 75) {
		parts.push(rest.slice(0, 75));
		rest = ' ' + rest.slice(75);
	}
	parts.push(rest);

	return parts.join(CRLF);
};

const line = (name: string, value: string): string => foldLine(`${name}:${value}`);

/** What the calendar itself is called in a subscriber's app — not an event's own title. */
const calendarName = (season: Season): string => `Frescati - ${season.name}`;

/** `2026-09-01T17:00:00.000Z` → `20260901T170000Z`. Already UTC, so this is a reformat, not a conversion. */
const toIcsTimestamp = (iso: string): string => iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const eventFor = (game: Game, season: Season, appUrl: string, now: string): string => {
	const location = [game.venue.name, game.venue.address].filter(Boolean).join(', ');
	const url = `${appUrl}/s/${season.id}/g/${game.id}`;

	const noteLines = [game.cancelledReason, game.note].filter((text): text is string => Boolean(text));
	// A real newline here, not a pre-escaped one — escapeText() below is what
	// turns it into the RFC 5545 `\n` a reader expects. Pre-escaping it would
	// have escapeText() double the backslash, leaving a literal `\n\n` visible
	// in every subscriber's calendar app instead of a blank line.
	const description = [...noteLines, url].join('\n\n');

	return [
		'BEGIN:VEVENT',
		line('UID', `${game.id}@frescati-calendar`),
		line('DTSTAMP', now),
		line('DTSTART', toIcsTimestamp(game.kickoff)),
		line('DTEND', toIcsTimestamp(game.endsAt)),
		line('SUMMARY', escapeText(season.name)),
		...(location ? [line('LOCATION', escapeText(location))] : []),
		line('STATUS', game.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'),
		line('URL', url),
		line('DESCRIPTION', escapeText(description)),
		'END:VEVENT',
	].join(CRLF);
};

export const buildIcsFeed = (season: Season, games: Game[], opts: { appUrl: string }): string => {
	const now = toIcsTimestamp(new Date().toISOString());

	const header = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Frescati//Calendar//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		line('X-WR-CALNAME', escapeText(calendarName(season))),
		line('NAME', escapeText(calendarName(season))),
		// A hint, not a guarantee: Apple Calendar and Outlook honour it loosely,
		// Google Calendar ignores it outright and polls on its own schedule
		// regardless. Either way there is no way to push an update into a
		// subscribed calendar, so this is the best "stay in sync" gets.
		'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
		'X-PUBLISHED-TTL:PT12H',
	];

	const events = games.map(game => eventFor(game, season, opts.appUrl, now));

	return [...header, ...events, 'END:VCALENDAR'].join(CRLF) + CRLF;
};
