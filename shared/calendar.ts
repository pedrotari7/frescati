import type { Game, Season } from './types';

/**
 * Builds the iCalendar (RFC 5545) text for a season's subscribable feed.
 *
 * Pure and deterministic given the same inputs. The actual freshness comes
 * from the caller re-running this against current Firestore state on every
 * fetch, not from anything stateful in here. `calendarFeed` in the backend is
 * the only caller; this exists separately so the format itself is unit-tested
 * without an emulator.
 *
 * Deliberately excludes response counts and rosters. The link this feed is
 * served from doesn't require signing in, see `calendarFeed.ts`, so nothing
 * goes in here beyond what a game's own screen already shows to a stranger
 * with the URL: when, where, and whether it's still on.
 */

const CRLF = '\r\n';

/**
 * RFC 5545 §3.3.11. These four characters need a backslash in TEXT values.
 *
 * A line break is any of the three spellings, not just the bare LF this used to
 * look for. A pasted cancellation reason can carry CRLF, and escaping only the
 * LF half of it left the CR in the value, where it is not legal and where a
 * strict parser is entitled to treat it as the end of a line. Matched longest
 * first so a CRLF becomes one escape rather than a stray CR and an escape.
 */
const escapeText = (value: string): string =>
	value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r\n|[\r\n]/g, '\\n');

/** What RFC 5545 §3.1 counts a folded line in. */
const FOLD_OCTETS = 75;

/** UTF-8 bytes in one code point, which is what that 75 is measured in. */
const octetsOf = (character: string): number => {
	const code = character.codePointAt(0) ?? 0;

	if (code < 0x80) return 1;
	if (code < 0x800) return 2;
	if (code < 0x10000) return 3;

	return 4;
};

/**
 * Folds a line at 75 octets as RFC 5545 §3.1 requires, continuing on the next
 * line with a single leading space.
 *
 * Counted in octets rather than in UTF-16 code units, and iterated by code point
 * rather than sliced. Both of those were wrong in the same direction, on a
 * Swedish football calendar:
 *
 *  * a venue in Ostermalm or Arsta is two bytes per accented letter, so a line
 *    of 75 of them went out at up to 150 octets, twice what the fold is for.
 *  * an emoji in a season name is a surrogate pair, and `slice` was free to cut
 *    between its halves. Each half alone is not a character, so encoding the
 *    result to UTF-8 replaced it, and the name came back mangled on the far end.
 *
 * The continuation space counts towards its own line's 75, which is the
 * conservative reading and what every parser worth worrying about assumes.
 */
const foldLine = (line: string): string => {
	const parts: string[] = [];
	let current = '';
	let octets = 0;

	for (const character of line) {
		const size = octetsOf(character);

		if (octets + size > FOLD_OCTETS) {
			parts.push(current);
			current = ' ';
			octets = 1;
		}

		current += character;
		octets += size;
	}

	parts.push(current);

	return parts.join(CRLF);
};

const line = (name: string, value: string): string => foldLine(`${name}:${value}`);

/** What the calendar itself is called in a subscriber's app, not an event's own title. */
const calendarName = (season: Season): string => `Frescati - ${season.name}`;

/** `2026-09-01T17:00:00.000Z` → `20260901T170000Z`. Already UTC, so this is a reformat, not a conversion. */
const toIcsTimestamp = (iso: string): string => iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const eventFor = (game: Game, season: Season, appUrl: string, now: string): string => {
	const location = [game.venue.name, game.venue.address].filter(Boolean).join(', ');
	const url = `${appUrl}/s/${season.id}/g/${game.id}`;

	const noteLines = [game.cancelledReason, game.note].filter((text): text is string => Boolean(text));
	// A real newline here, not a pre-escaped one. escapeText() below is what
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
