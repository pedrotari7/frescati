import { getCalendarLink, rotateCalendarToken } from '../src/calendarLink';
import { callRequest, clearFirestore, getDb, writeSeason } from './helpers';

const SEASON_ID = 'season-1';
const MEMBER = 'member-1';
const EXTRA = 'extra-1';
const SEASON_ADMIN = 'season-admin-1';
const APP_ADMIN = 'app-admin-1';

const tokenOf = async (): Promise<string | undefined> => {
	const snap = await getDb().doc(`seasons/${SEASON_ID}/calendar/token`).get();
	return snap.exists ? (snap.data() as { token: string }).token : undefined;
};

const feedIndexFor = async (token: string): Promise<{ seasonId: string } | undefined> => {
	const snap = await getDb().doc(`calendarFeeds/${token}`).get();
	return snap.exists ? (snap.data() as { seasonId: string }) : undefined;
};

beforeEach(async () => {
	await clearFirestore();
	await writeSeason(SEASON_ID, { adminUids: [SEASON_ADMIN] });
});

describe('getCalendarLink', () => {
	it('rejects when nobody is signed in', async () => {
		await expect(getCalendarLink.run(callRequest({ seasonId: SEASON_ID }))).rejects.toMatchObject({
			code: 'unauthenticated',
		});
	});

	it('rejects a request with no seasonId', async () => {
		await expect(getCalendarLink.run(callRequest({}, { uid: MEMBER }))).rejects.toMatchObject({
			code: 'invalid-argument',
		});
	});

	it('rejects a season that does not exist', async () => {
		await expect(getCalendarLink.run(callRequest({ seasonId: 'ghost' }, { uid: MEMBER }))).rejects.toMatchObject({
			code: 'not-found',
		});
	});

	// No allowlist here on purpose, reads are already open to anyone signed
	// in, and this hands out a link to the same thing, not anything wider.
	it('mints a link for any signed-in user, member or extra', async () => {
		const { url } = await getCalendarLink.run(callRequest({ seasonId: SEASON_ID }, { uid: EXTRA }));

		expect(url).toContain('calendarFeed?token=');
		expect(await tokenOf()).toBeDefined();
	});

	it('points the reverse index back at the season', async () => {
		await getCalendarLink.run(callRequest({ seasonId: SEASON_ID }, { uid: MEMBER }));

		const token = await tokenOf();
		expect(await feedIndexFor(token!)).toMatchObject({ seasonId: SEASON_ID });
	});

	it('is idempotent, a second call returns the same token', async () => {
		const first = await getCalendarLink.run(callRequest({ seasonId: SEASON_ID }, { uid: MEMBER }));
		const second = await getCalendarLink.run(callRequest({ seasonId: SEASON_ID }, { uid: MEMBER }));

		expect(second.url).toBe(first.url);
	});
});

describe('rotateCalendarToken', () => {
	it('rejects when nobody is signed in', async () => {
		await expect(rotateCalendarToken.run(callRequest({ seasonId: SEASON_ID }))).rejects.toMatchObject({
			code: 'unauthenticated',
		});
	});

	it('rejects a signed-in member who is not a season admin', async () => {
		await expect(
			rotateCalendarToken.run(callRequest({ seasonId: SEASON_ID }, { uid: MEMBER }))
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('lets a season admin rotate it', async () => {
		await getCalendarLink.run(callRequest({ seasonId: SEASON_ID }, { uid: MEMBER }));
		const before = await tokenOf();

		await rotateCalendarToken.run(callRequest({ seasonId: SEASON_ID }, { uid: SEASON_ADMIN }));

		expect(await tokenOf()).not.toBe(before);
	});

	it('lets an app admin rotate a season they are not personally listed on', async () => {
		await getCalendarLink.run(callRequest({ seasonId: SEASON_ID }, { uid: MEMBER }));

		await expect(
			rotateCalendarToken.run(callRequest({ seasonId: SEASON_ID }, { uid: APP_ADMIN, admin: true }))
		).resolves.toMatchObject({ url: expect.stringContaining('calendarFeed?token=') });
	});

	it('mints a token even when none existed yet', async () => {
		const { url } = await rotateCalendarToken.run(callRequest({ seasonId: SEASON_ID }, { uid: SEASON_ADMIN }));

		expect(url).toContain('calendarFeed?token=');
		expect(await tokenOf()).toBeDefined();
	});

	// The whole point of rotating: the old link stops resolving to anything.
	it('deletes the old reverse index so the previous link 404s', async () => {
		await getCalendarLink.run(callRequest({ seasonId: SEASON_ID }, { uid: MEMBER }));
		const oldToken = await tokenOf();

		await rotateCalendarToken.run(callRequest({ seasonId: SEASON_ID }, { uid: SEASON_ADMIN }));

		expect(await feedIndexFor(oldToken!)).toBeUndefined();
	});

	it('points the new reverse index at the season', async () => {
		await rotateCalendarToken.run(callRequest({ seasonId: SEASON_ID }, { uid: SEASON_ADMIN }));

		const token = await tokenOf();
		expect(await feedIndexFor(token!)).toMatchObject({ seasonId: SEASON_ID });
	});

	it('rejects a season that does not exist', async () => {
		await expect(
			rotateCalendarToken.run(callRequest({ seasonId: 'ghost' }, { uid: SEASON_ADMIN }))
		).rejects.toMatchObject({ code: 'not-found' });
	});
});
