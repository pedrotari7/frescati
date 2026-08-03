import { onGameDeleted, onSeasonDeleted } from '../src/cascadeDeletes';
import { clearAuth, clearFirestore, getDb, paramsEvent, writeGame, writeResponse, writeSeason } from './helpers';

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const MEMBER = 'member-1';

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

describe('onGameDeleted', () => {
	it('cleans up everything left behind under the deleted game', async () => {
		await writeSeason(SEASON_ID);
		await writeGame(SEASON_ID, GAME_ID);
		await writeResponse(SEASON_ID, GAME_ID, MEMBER);
		await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}/tournament/teams`).set({ teams: [] });

		// Firestore doesn't fire deletes for us here — the game document is
		// already gone by the time this trigger would run in production.
		await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}`).delete();

		await onGameDeleted.run(paramsEvent({ seasonId: SEASON_ID, gameId: GAME_ID }));

		const responseSnap = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}/responses/${MEMBER}`).get();
		const teamsSnap = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}/tournament/teams`).get();
		expect(responseSnap.exists).toBe(false);
		expect(teamsSnap.exists).toBe(false);
	});
});

describe('onSeasonDeleted', () => {
	it('cleans up every game and response left behind under the deleted season', async () => {
		await writeSeason(SEASON_ID);
		await writeGame(SEASON_ID, GAME_ID);
		await writeResponse(SEASON_ID, GAME_ID, MEMBER);

		await getDb().doc(`seasons/${SEASON_ID}`).delete();

		await onSeasonDeleted.run(paramsEvent({ seasonId: SEASON_ID }));

		const gameSnap = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}`).get();
		const responseSnap = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}/responses/${MEMBER}`).get();
		expect(gameSnap.exists).toBe(false);
		expect(responseSnap.exists).toBe(false);
	});
});
