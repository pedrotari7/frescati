import { buildGameShare, isShareable, shareToText } from './share';
import { EMPTY_COUNTS } from './types';
import type { Game, Season } from './types';

const counts = (playing: number): Game['counts'] => ({ ...EMPTY_COUNTS, membersIn: playing, playing });

const game = (overrides: Partial<Game> = {}): Game =>
	({
		id: 'game-1',
		kickoff: '2026-09-01T17:00:00.000Z',
		venue: { name: 'Frescati IP' },
		status: 'scheduled',
		counts: counts(10),
		...overrides,
	}) as Game;

const season = (overrides: Partial<Season> = {}): Season =>
	({
		id: 'season-1',
		minPlayers: 10,
		slot: { timezone: 'Europe/Stockholm' },
		...overrides,
	}) as Season;

const appUrl = 'https://frescati.xyz';

describe('buildGameShare', () => {
	it('leads with when and where', () => {
		const { text } = buildGameShare(game(), season(), { appUrl });

		expect(text).toContain('Tue 1 Sep, 19:00 at Frescati IP');
	});

	it('asks for players when the game is short', () => {
		const { text } = buildGameShare(game({ counts: counts(8) }), season(), { appUrl });

		expect(text).toBe('Tue 1 Sep, 19:00 at Frescati IP. 8 playing, 2 short. Can you make it?');
	});

	// The game's own minimum beats the season's, the same way the headcount bar
	// reads it, or a message would ask for players a game does not need.
	it('counts the shortfall against the game override', () => {
		const { text } = buildGameShare(game({ counts: counts(8), minPlayers: 14 }), season(), { appUrl });

		expect(text).toContain('6 short');
	});

	it('says the format once the game is on', () => {
		const { text } = buildGameShare(game(), season(), { appUrl });

		expect(text).toBe('Tue 1 Sep, 19:00 at Frescati IP. 10 playing, 5v5.');
	});

	// Past eleven a game stops being one match, and the format says so. The
	// message repeats whatever the headcount bar is showing rather than halving
	// the count itself.
	it('says how many teams once there are enough for more than one match', () => {
		const { text } = buildGameShare(game({ counts: counts(14) }), season(), { appUrl });

		expect(text).toContain('14 playing, 3 teams');
	});

	// A minimum low enough that the count clears it without being a game yet.
	it('drops the format when the headcount does not describe one', () => {
		const { text } = buildGameShare(game({ counts: counts(3) }), season({ minPlayers: 2 }), { appUrl });

		expect(text).toBe('Tue 1 Sep, 19:00 at Frescati IP. 3 playing.');
	});

	it('says a cancelled game is off instead of counting it', () => {
		const { text } = buildGameShare(game({ status: 'cancelled', counts: counts(14) }), season(), { appUrl });

		expect(text).toBe('Tue 1 Sep, 19:00 at Frescati IP is off.');
		expect(text).not.toContain('playing');
	});

	it('carries the reason a game is off', () => {
		const { text } = buildGameShare(game({ status: 'cancelled', cancelledReason: 'Floodlight out' }), season(), {
			appUrl,
		});

		expect(text).toBe('Tue 1 Sep, 19:00 at Frescati IP is off: Floodlight out');
	});

	it('links straight to the game', () => {
		const { url } = buildGameShare(game(), season(), { appUrl });

		expect(url).toBe('https://frescati.xyz/s/season-1/g/game-1');
	});

	it('does not double the slash on an app url with a trailing one', () => {
		const { url } = buildGameShare(game(), season(), { appUrl: 'https://frescati.xyz/' });

		expect(url).toBe('https://frescati.xyz/s/season-1/g/game-1');
	});

	// Every share target appends the url itself, so a copy in the text posts it
	// twice.
	it('keeps the link out of the text', () => {
		const { text } = buildGameShare(game(), season(), { appUrl });

		expect(text).not.toContain('http');
	});
});

describe('shareToText', () => {
	it('puts the link on its own line, where a chat app makes it a preview', () => {
		expect(shareToText({ text: 'Tue 1 Sep', url: 'https://frescati.xyz' })).toBe('Tue 1 Sep\nhttps://frescati.xyz');
	});
});

describe('isShareable', () => {
	// The case it differs from `isWatchable` on, and the reason it is its own
	// predicate: a game being off is the most useful thing here to pass on.
	it('covers a cancelled game', () => {
		expect(isShareable('cancelled')).toBe(true);
	});

	it('covers a game whose answers have closed', () => {
		expect(isShareable('locked')).toBe(true);
	});

	it('leaves out a game that has been played', () => {
		expect(isShareable('finished')).toBe(false);
	});
});
