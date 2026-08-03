import { sendTestPush } from '../src/sendTestPush';
import { DEFAULT_NOTIFICATION_PREFS } from '../../shared/types';
import { buildGamePush, buildNewPlayerPush } from '../../shared/notifications';
import { callRequest, clearAuth, clearFirestore, getDb, writeGame, writeSeason, writeUser } from './helpers';

const CALLER = 'app-admin-1';
const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

describe('sendTestPush', () => {
	it('rejects when nobody is signed in', async () => {
		await expect(sendTestPush.run(callRequest({ kind: 'reminder' }))).rejects.toMatchObject({
			code: 'unauthenticated',
		});
	});

	it('rejects a caller who is not an app admin', async () => {
		await expect(
			sendTestPush.run(callRequest({ kind: 'reminder' }, { uid: CALLER, admin: false }))
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('rejects an unknown notification kind', async () => {
		await expect(
			sendTestPush.run(callRequest({ kind: 'not-a-real-kind' }, { uid: CALLER, admin: true }))
		).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	it('sends a sample notification when no game is named', async () => {
		const result = await sendTestPush.run(callRequest({ kind: 'reminder' }, { uid: CALLER, admin: true }));

		expect(result.sent).toBe(0);
		expect(result.devices).toBe(0);
		expect(result.prefEnabled).toBe(true);
		expect(result.payload.url).toBe('/seasons');
	});

	it('throws not-found when a named game does not exist', async () => {
		await expect(
			sendTestPush.run(
				callRequest({ kind: 'reminder', seasonId: SEASON_ID, gameId: GAME_ID }, { uid: CALLER, admin: true })
			)
		).rejects.toMatchObject({ code: 'not-found' });
	});

	it('builds a real context from a named game', async () => {
		await writeSeason(SEASON_ID, {
			minPlayers: 10,
			slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'Europe/Stockholm' },
		});
		await writeGame(SEASON_ID, GAME_ID, {
			kickoff: '2026-09-01T17:00:00.000Z',
			counts: { membersIn: 4, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 4 },
		});

		const result = await sendTestPush.run(
			callRequest({ kind: 'reminder', seasonId: SEASON_ID, gameId: GAME_ID }, { uid: CALLER, admin: true })
		);

		expect(result.payload.url).toBe(`/s/${SEASON_ID}/g/${GAME_ID}`);
		expect(result.payload).toEqual(
			buildGamePush('reminder', {
				when: 'Tue 1 Sep · 19:00',
				url: `/s/${SEASON_ID}/g/${GAME_ID}`,
				gameId: GAME_ID,
				playing: 4,
			})
		);
	});

	// The admin notice has no game behind it, so it takes neither of the two
	// arguments the others do — it stands the caller in as the newcomer.
	it('sends the new-player notice as if the caller had just joined', async () => {
		await writeUser(CALLER, { displayName: 'Pedro Alvito' });

		const result = await sendTestPush.run(callRequest({ kind: 'newPlayer' }, { uid: CALLER, admin: true }));

		expect(result.payload).toEqual(buildNewPlayerPush({ uid: CALLER, displayName: 'Pedro Alvito' }));
	});

	it('gates the new-player notice on its own preference', async () => {
		await writeUser(CALLER, { notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, newPlayers: false } });

		const result = await sendTestPush.run(callRequest({ kind: 'newPlayer' }, { uid: CALLER, admin: true }));

		expect(result.prefEnabled).toBe(false);
	});

	it('reports prefEnabled false when the caller has opted out of that kind', async () => {
		await writeUser(CALLER, { notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, reminders: false } });

		const result = await sendTestPush.run(callRequest({ kind: 'reminder' }, { uid: CALLER, admin: true }));

		expect(result.prefEnabled).toBe(false);
	});

	it('reports the token count separately from whether the preference is enabled', async () => {
		// Opted out, so `sendPush` short-circuits before ever calling FCM — there
		// is no emulator for it, and this is the only way to exercise a nonzero
		// device count without one.
		await writeUser(CALLER, { notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, reminders: false } });
		await getDb()
			.doc(`users/${CALLER}/pushTokens/a-token`)
			.set({ token: 'a-token', createdAt: new Date().toISOString(), userAgent: 'jest' });

		const result = await sendTestPush.run(callRequest({ kind: 'reminder' }, { uid: CALLER, admin: true }));

		expect(result.devices).toBe(1);
		expect(result.sent).toBe(0);
		expect(result.prefEnabled).toBe(false);
	});
});
