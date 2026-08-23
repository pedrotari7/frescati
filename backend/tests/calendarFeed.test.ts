import { calendarFeed } from '../src/calendarFeed';
import { clearFirestore, getDb, writeGame, writeSeason } from './helpers';

const SEASON_ID = 'season-1';
const TOKEN = 'a-real-looking-token';

/**
 * `calendarFeed` is a plain `onRequest` handler, no `.run()` wrapper, unlike
 * the callables elsewhere in this suite, because it *is* the function. These
 * stand in for just enough of Express to drive it: a `query` object to read
 * the token from, and a response whose chained calls this can inspect.
 */
const fakeReq = (query: Record<string, string>) => ({ query }) as Parameters<typeof calendarFeed>[0];

const fakeRes = () => {
	const state = { statusCode: 0, headers: {} as Record<string, string>, body: '' };
	const res = {
		status(code: number) {
			state.statusCode = code;
			return res;
		},
		set(name: string, value: string) {
			state.headers[name] = value;
			return res;
		},
		send(body: string) {
			state.body = body;
			return res;
		},
	};
	return { res: res as unknown as Parameters<typeof calendarFeed>[1], state };
};

const indexToken = (token: string, seasonId: string) => getDb().doc(`calendarFeeds/${token}`).set({ seasonId });

beforeEach(clearFirestore);

describe('calendarFeed', () => {
	it('404s with no token at all', async () => {
		const { res, state } = fakeRes();

		await calendarFeed(fakeReq({}), res);

		expect(state.statusCode).toBe(404);
	});

	it('404s a token nothing indexes', async () => {
		const { res, state } = fakeRes();

		await calendarFeed(fakeReq({ token: 'a-real-looking-token-nothing-indexes' }), res);

		expect(state.statusCode).toBe(404);
	});

	it('404s rather than crashes on a token shaped to break the Firestore path, like one containing a slash', async () => {
		const { res, state } = fakeRes();

		await calendarFeed(fakeReq({ token: 'a/b' }), res);

		expect(state.statusCode).toBe(404);
	});

	it('404s a token whose season has since been deleted', async () => {
		await indexToken(TOKEN, SEASON_ID);
		const { res, state } = fakeRes();

		await calendarFeed(fakeReq({ token: TOKEN }), res);

		expect(state.statusCode).toBe(404);
	});

	it('serves a valid calendar for a real token', async () => {
		await writeSeason(SEASON_ID, { name: 'Autumn 2026' });
		await writeGame(SEASON_ID, 'game-1');
		await indexToken(TOKEN, SEASON_ID);
		const { res, state } = fakeRes();

		await calendarFeed(fakeReq({ token: TOKEN }), res);

		expect(state.statusCode).toBe(200);
		expect(state.headers['Content-Type']).toBe('text/calendar; charset=utf-8');
		expect(state.body).toContain('BEGIN:VCALENDAR');
		expect(state.body).toContain('game-1@frescati-calendar');
	});

	it('includes every game in the season, not just one', async () => {
		await writeSeason(SEASON_ID);
		await writeGame(SEASON_ID, 'game-1', { kickoff: '2026-09-01T17:00:00.000Z' });
		await writeGame(SEASON_ID, 'game-2', { kickoff: '2026-09-08T17:00:00.000Z' });
		await indexToken(TOKEN, SEASON_ID);
		const { res, state } = fakeRes();

		await calendarFeed(fakeReq({ token: TOKEN }), res);

		expect(state.body.match(/BEGIN:VEVENT/g)).toHaveLength(2);
	});

	it('marks a cancelled game CANCELLED', async () => {
		await writeSeason(SEASON_ID);
		await writeGame(SEASON_ID, 'game-1', { status: 'cancelled', cancelledReason: 'Pitch closed' });
		await indexToken(TOKEN, SEASON_ID);
		const { res, state } = fakeRes();

		await calendarFeed(fakeReq({ token: TOKEN }), res);

		expect(state.body).toContain('STATUS:CANCELLED');
		expect(state.body).toContain('Pitch closed');
	});

	it('tells the caller not to cache it', async () => {
		await writeSeason(SEASON_ID);
		await indexToken(TOKEN, SEASON_ID);
		const { res, state } = fakeRes();

		await calendarFeed(fakeReq({ token: TOKEN }), res);

		expect(state.headers['Cache-Control']).toBe('no-store');
	});
});
