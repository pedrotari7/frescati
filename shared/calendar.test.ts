import { buildIcsFeed } from './calendar';
import { EMPTY_COUNTS } from './types';
import type { Game, Season } from './types';

const season = {
	id: 'season-1',
	name: 'Autumn 2026',
	venue: { name: 'Frescati IP' },
} as Season;

const game = (overrides: Partial<Game> = {}): Game =>
	({
		id: 'game-1',
		seasonId: 'season-1',
		kickoff: '2026-09-01T17:00:00.000Z',
		endsAt: '2026-09-01T18:30:00.000Z',
		venue: { name: 'Frescati IP' },
		status: 'scheduled',
		isOneOff: false,
		counts: { ...EMPTY_COUNTS },
		atRisk: false,
		createdAt: '2026-08-01T00:00:00.000Z',
		createdBy: 'app-admin',
		...overrides,
	}) as Game;

const APP_URL = 'https://frescati.example';

describe('buildIcsFeed', () => {
	it('produces a valid, empty calendar for a season with no games', () => {
		const ics = buildIcsFeed(season, [], { appUrl: APP_URL });

		expect(ics).toContain('BEGIN:VCALENDAR');
		expect(ics).toContain('VERSION:2.0');
		expect(ics).toContain('END:VCALENDAR');
		expect(ics).not.toContain('BEGIN:VEVENT');
		expect(ics.endsWith('\r\n')).toBe(true);
	});

	it('names the calendar after the app and the season, so a subscriber can tell it apart from others', () => {
		const ics = buildIcsFeed(season, [], { appUrl: APP_URL });

		expect(ics).toContain('X-WR-CALNAME:Frescati - Autumn 2026');
		expect(ics).toContain('NAME:Frescati - Autumn 2026');
	});

	it("leaves an event's own title as just the season name, not the app-prefixed calendar name", () => {
		const ics = buildIcsFeed(season, [game()], { appUrl: APP_URL });

		expect(ics).toContain('SUMMARY:Autumn 2026');
		expect(ics).not.toContain('SUMMARY:Frescati - Autumn 2026');
	});

	it('emits one VEVENT per game, in the order given', () => {
		const games = [game({ id: 'a' }), game({ id: 'b' })];

		const ics = buildIcsFeed(season, games, { appUrl: APP_URL });

		expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
		expect(ics.indexOf('a@frescati-calendar')).toBeLessThan(ics.indexOf('b@frescati-calendar'));
	});

	it('reformats an ISO UTC instant into a bare UTC timestamp, with no timezone math', () => {
		const ics = buildIcsFeed(season, [game()], { appUrl: APP_URL });

		expect(ics).toContain('DTSTART:20260901T170000Z');
		expect(ics).toContain('DTEND:20260901T183000Z');
	});

	it('keeps the same UID across two builds of the same game, so a subscriber updates in place', () => {
		const first = buildIcsFeed(season, [game()], { appUrl: APP_URL });
		const second = buildIcsFeed(season, [game({ venue: { name: 'A different pitch' } })], { appUrl: APP_URL });

		const uid = (ics: string) => ics.match(/UID:([^\r\n]+)/)?.[1];
		expect(uid(first)).toBe(uid(second));
	});

	it('marks a cancelled game CANCELLED and leaves everything else CONFIRMED', () => {
		const scheduled = buildIcsFeed(season, [game({ status: 'scheduled' })], { appUrl: APP_URL });
		const played = buildIcsFeed(season, [game({ status: 'played' })], { appUrl: APP_URL });
		const cancelled = buildIcsFeed(season, [game({ status: 'cancelled' })], { appUrl: APP_URL });

		expect(scheduled).toContain('STATUS:CONFIRMED');
		expect(played).toContain('STATUS:CONFIRMED');
		expect(cancelled).toContain('STATUS:CANCELLED');
	});

	it('links back to the game screen', () => {
		const ics = buildIcsFeed(season, [game()], { appUrl: APP_URL });

		expect(ics).toContain('URL:https://frescati.example/s/season-1/g/game-1');
	});

	it('carries a cancelled reason or note into the description', () => {
		const ics = buildIcsFeed(season, [game({ status: 'cancelled', cancelledReason: 'Pitch waterlogged' })], {
			appUrl: APP_URL,
		});

		expect(ics).toContain('Pitch waterlogged');
	});

	it('separates the note from the URL with a single escaped newline, not a literal backslash-n', () => {
		const ics = buildIcsFeed(season, [game({ status: 'cancelled', cancelledReason: 'Pitch waterlogged' })], {
			appUrl: APP_URL,
		});

		const description = ics.match(/DESCRIPTION:(.+?)\r\nEND:VEVENT/s)?.[1].replace(/\r\n /g, '');
		expect(description).toBe('Pitch waterlogged\\n\\nhttps://frescati.example/s/season-1/g/game-1');
	});

	it('never mentions who is in, who is out, or a headcount', () => {
		const ics = buildIcsFeed(
			season,
			[game({ counts: { ...EMPTY_COUNTS, membersIn: 8, playing: 8 }, atRisk: true })],
			{ appUrl: APP_URL }
		);

		expect(ics).not.toMatch(/\b8\b/);
		expect(ics.toLowerCase()).not.toContain('playing');
	});

	it('escapes commas, semicolons and backslashes in free text', () => {
		const ics = buildIcsFeed({ ...season, name: 'Tuesdays; 5-a-side, back \\ forth' }, [], { appUrl: APP_URL });

		expect(ics).toContain('X-WR-CALNAME:Frescati - Tuesdays\\; 5-a-side\\, back \\\\ forth');
	});

	it('folds a line longer than 75 octets and continues it with a leading space', () => {
		const longAddress = 'A'.repeat(120);
		const ics = buildIcsFeed(season, [game({ venue: { name: 'Frescati IP', address: longAddress } })], {
			appUrl: APP_URL,
		});

		const locationLine = ics.split('\r\n').find(l => l.startsWith('LOCATION:'));
		expect(locationLine!.length).toBeLessThanOrEqual(75);

		const rejoined = ics
			.split('\r\n')
			.reduce((acc, l) => (l.startsWith(' ') ? acc + l.slice(1) : acc + '\r\n' + l));
		expect(rejoined).toContain(longAddress);
	});

	it('omits LOCATION entirely when there is no venue name at all', () => {
		const ics = buildIcsFeed(season, [game({ venue: { name: '' } })], { appUrl: APP_URL });

		expect(ics).not.toContain('LOCATION');
	});
});
