import { getGameWatchers } from '../src/getGameWatchers';
import { callRequest, clearFirestore, getDb, writeGame, writeSeason } from './helpers';

const ADMIN = 'app-admin-1';
const ANNA = 'anna';
const JOHAN = 'johan';

const SEASON = 'season-1';
const GAME = 'game-1';

const watch = (uid: string, createdAt = '2026-08-01T10:00:00.000Z') =>
	getDb().doc(`seasons/${SEASON}/games/${GAME}/watchers/${uid}`).set({ uid, createdAt });

const call = (data: unknown, auth?: { uid: string; admin?: boolean }) => getGameWatchers.run(callRequest(data, auth));

beforeEach(async () => {
	await clearFirestore();
	await writeSeason(SEASON);
	await writeGame(SEASON, GAME);
});

describe('getGameWatchers', () => {
	it('rejects when nobody is signed in', async () => {
		await expect(call({ seasonId: SEASON, gameId: GAME })).rejects.toMatchObject({ code: 'unauthenticated' });
	});

	// The whole reason this is a callable. `firestore.rules` keeps a watcher
	// document readable only by its owner — season admins included — and this
	// function is the single hole cut in that, so it holds the same line the
	// rule does and opens for nothing weaker than the global role.
	it('rejects a caller who is not an app admin', async () => {
		await expect(call({ seasonId: SEASON, gameId: GAME }, { uid: ADMIN, admin: false })).rejects.toMatchObject({
			code: 'permission-denied',
		});
	});

	it('refuses a call with no game to look at', async () => {
		await expect(call({ seasonId: SEASON }, { uid: ADMIN, admin: true })).rejects.toMatchObject({
			code: 'invalid-argument',
		});
		await expect(call({}, { uid: ADMIN, admin: true })).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	// "Nobody is following this" and "you asked about a game that isn't there"
	// look identical on screen, and only one of them is worth believing.
	it('refuses a game that does not exist rather than reporting nobody', async () => {
		await expect(call({ seasonId: SEASON, gameId: 'nope' }, { uid: ADMIN, admin: true })).rejects.toMatchObject({
			code: 'not-found',
		});
	});

	it('returns nobody when the game has no watchers', async () => {
		const { uids } = await call({ seasonId: SEASON, gameId: GAME }, { uid: ADMIN, admin: true });

		expect(uids).toEqual([]);
	});

	it('returns everyone following the game', async () => {
		await watch(ANNA);
		await watch(JOHAN);

		const { uids } = await call({ seasonId: SEASON, gameId: GAME }, { uid: ADMIN, admin: true });

		expect(uids.sort()).toEqual([ANNA, JOHAN]);
	});

	// Read off the document ids, the same as `getWatcherUids` does for the
	// notification itself — so what the screen shows and who actually gets sent
	// to can't disagree about who is following.
	it('reads the uid off the document id, not the field beside it', async () => {
		await getDb().doc(`seasons/${SEASON}/games/${GAME}/watchers/${ANNA}`).set({ createdAt: '' });

		const { uids } = await call({ seasonId: SEASON, gameId: GAME }, { uid: ADMIN, admin: true });

		expect(uids).toEqual([ANNA]);
	});

	it('only reports the game it was asked about', async () => {
		await writeGame(SEASON, 'game-2');
		await watch(ANNA);
		await getDb().doc(`seasons/${SEASON}/games/game-2/watchers/${JOHAN}`).set({ uid: JOHAN, createdAt: '' });

		const { uids } = await call({ seasonId: SEASON, gameId: GAME }, { uid: ADMIN, admin: true });

		expect(uids).toEqual([ANNA]);
	});
});
