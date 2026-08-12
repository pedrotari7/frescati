import { sendTestEmail } from '../src/sendTestEmail';
import { DEFAULT_NOTIFICATION_PREFS } from '../../shared/types';
import { buildGamePush, buildNewPlayerPush } from '../../shared/notifications';
import { callRequest, clearAuth, clearFirestore, createAuthUser, writeGame, writeSeason, writeUser } from './helpers';

/**
 * The one debug tool that can notify somebody other than the caller. Same
 * spare-mocking approach as `email.test.ts`: `fetch` is stubbed, everything
 * else — prefs, addresses, the game context — runs for real against the
 * emulators, because those are the parts that would silently mail the wrong
 * person or the wrong words.
 */

const ADMIN = 'app-admin-1';
const ANNA = 'anna';
const JOHAN = 'johan';
const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';

const configure = () => {
	process.env.EMAIL_FROM = 'Frescati <notifications@frescati.example>';
	process.env.APP_URL = 'https://frescati.example';
	process.env.RESEND_API_KEY = 'test-key';
};

const resendReturns = (response: { ok: boolean; status: number; text: string }) =>
	jest.spyOn(global, 'fetch').mockResolvedValue({ ...response, text: async () => response.text } as never);

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();

	delete process.env.EMAIL_FROM;
	delete process.env.APP_URL;
	delete process.env.RESEND_API_KEY;
	delete process.env.FUNCTIONS_EMULATOR;

	resendReturns({ ok: true, status: 200, text: '' });
});

afterEach(() => jest.restoreAllMocks());

describe('sendTestEmail', () => {
	it('rejects when nobody is signed in', async () => {
		await expect(sendTestEmail.run(callRequest({ kind: 'reminder', uids: [ANNA] }))).rejects.toMatchObject({
			code: 'unauthenticated',
		});
	});

	it('rejects a caller who is not an app admin', async () => {
		await expect(
			sendTestEmail.run(callRequest({ kind: 'reminder', uids: [ANNA] }, { uid: ADMIN, admin: false }))
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('rejects an unknown notification kind', async () => {
		await expect(
			sendTestEmail.run(callRequest({ kind: 'not-a-real-kind', uids: [ANNA] }, { uid: ADMIN, admin: true }))
		).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	it('rejects an empty recipient list', async () => {
		await expect(
			sendTestEmail.run(callRequest({ kind: 'reminder', uids: [] }, { uid: ADMIN, admin: true }))
		).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	it('rejects when uids was left out entirely', async () => {
		await expect(
			sendTestEmail.run(callRequest({ kind: 'reminder' }, { uid: ADMIN, admin: true }))
		).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	it('builds the same payload the push debug screen would, from a named game', async () => {
		configure();
		await writeSeason(SEASON_ID, { slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'Europe/Stockholm' } });
		await writeGame(SEASON_ID, GAME_ID, {
			kickoff: '2026-09-01T17:00:00.000Z',
			counts: { membersIn: 4, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 4 },
		});
		await writeUser(ANNA);
		await createAuthUser(ANNA, { email: 'anna@example.test' });

		const result = await sendTestEmail.run(
			callRequest({ kind: 'reminder', uids: [ANNA], seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN, admin: true })
		);

		expect(result.payload).toEqual(
			buildGamePush('reminder', {
				when: 'Tue 1 Sep · 19:00',
				url: `/s/${SEASON_ID}/g/${GAME_ID}`,
				gameId: GAME_ID,
				playing: 4,
			})
		);
	});

	// No game behind it, so it stands the caller in as the newcomer — same as
	// `sendTestPush`.
	it('sends the new-player notice as if the caller had just joined', async () => {
		configure();
		await writeUser(ADMIN, { displayName: 'Pedro Alvito' });
		await writeUser(ANNA);
		await createAuthUser(ANNA, { email: 'anna@example.test' });

		const result = await sendTestEmail.run(callRequest({ kind: 'newPlayer', uids: [ANNA] }, { uid: ADMIN, admin: true }));

		expect(result.payload).toEqual(buildNewPlayerPush({ uid: ADMIN, displayName: 'Pedro Alvito', seasonId: null }));
	});

	it('emails somebody with a verified address and the fallback left on', async () => {
		configure();
		await writeUser(ANNA);
		await createAuthUser(ANNA, { email: 'anna@example.test' });

		const result = await sendTestEmail.run(callRequest({ kind: 'reminder', uids: [ANNA] }, { uid: ADMIN, admin: true }));

		expect(result.sent).toBe(1);
		expect(result.results).toEqual([{ uid: ANNA, displayName: 'Test Player', status: 'sent' }]);
	});

	it('reports no address for a uid with no Auth account behind it', async () => {
		configure();
		await writeUser(ANNA);

		const result = await sendTestEmail.run(callRequest({ kind: 'reminder', uids: [ANNA] }, { uid: ADMIN, admin: true }));

		expect(result.sent).toBe(0);
		expect(result.results).toEqual([{ uid: ANNA, displayName: 'Test Player', status: 'noAddress' }]);
	});

	// Sign-in is Google-only today, so this filters nothing in practice — see
	// `email.test.ts` for why it's checked anyway.
	it('reports no address for an unverified email', async () => {
		configure();
		await writeUser(ANNA);
		await createAuthUser(ANNA, { email: 'anna@example.test', emailVerified: false });

		const result = await sendTestEmail.run(callRequest({ kind: 'reminder', uids: [ANNA] }, { uid: ADMIN, admin: true }));

		expect(result.results[0].status).toBe('noAddress');
	});

	it('reports email off, and never sends, when the fallback is switched off', async () => {
		configure();
		await writeUser(ANNA, { notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, emailFallback: false } });
		await createAuthUser(ANNA, { email: 'anna@example.test' });

		const result = await sendTestEmail.run(callRequest({ kind: 'reminder', uids: [ANNA] }, { uid: ADMIN, admin: true }));

		expect(result.sent).toBe(0);
		expect(result.results).toEqual([{ uid: ANNA, displayName: 'Test Player', status: 'emailOff' }]);
	});

	// Deliberately unlike the real fallback: an admin picking this person and
	// this kind is a one-off decision, not the automated send the per-kind
	// preference exists to silence.
	it('does not gate on the per-kind preference', async () => {
		configure();
		await writeUser(ANNA, { notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, reminders: false } });
		await createAuthUser(ANNA, { email: 'anna@example.test' });

		const result = await sendTestEmail.run(callRequest({ kind: 'reminder', uids: [ANNA] }, { uid: ADMIN, admin: true }));

		expect(result.sent).toBe(1);
		expect(result.results[0].status).toBe('sent');
	});

	it('reports each recipient independently', async () => {
		configure();
		await writeUser(ANNA);
		await createAuthUser(ANNA, { email: 'anna@example.test' });
		await writeUser(JOHAN, { notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, emailFallback: false } });
		await createAuthUser(JOHAN, { email: 'johan@example.test' });

		const result = await sendTestEmail.run(
			callRequest({ kind: 'reminder', uids: [ANNA, JOHAN] }, { uid: ADMIN, admin: true })
		);

		expect(result.sent).toBe(1);
		expect(result.results).toEqual(
			expect.arrayContaining([
				{ uid: ANNA, displayName: 'Test Player', status: 'sent' },
				{ uid: JOHAN, displayName: 'Test Player', status: 'emailOff' },
			])
		);
	});

	it('de-duplicates a uid picked twice', async () => {
		configure();
		await writeUser(ANNA);
		await createAuthUser(ANNA, { email: 'anna@example.test' });

		const result = await sendTestEmail.run(
			callRequest({ kind: 'reminder', uids: [ANNA, ANNA] }, { uid: ADMIN, admin: true })
		);

		expect(result.sent).toBe(1);
		expect(result.results).toHaveLength(1);
	});

	it('sends nothing, and reports everyone as no address, when no sender is configured', async () => {
		await writeUser(ANNA);
		await createAuthUser(ANNA, { email: 'anna@example.test' });

		const result = await sendTestEmail.run(callRequest({ kind: 'reminder', uids: [ANNA] }, { uid: ADMIN, admin: true }));

		// Eligibility is still reported honestly — only the transport is inert.
		expect(result.results[0].status).toBe('sent');
		expect(result.sent).toBe(0);
		expect(fetch).not.toHaveBeenCalled();
	});
});
