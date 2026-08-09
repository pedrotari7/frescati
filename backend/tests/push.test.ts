import { DEFAULT_NOTIFICATION_PREFS } from '../../shared/types';
import { buildGamePush } from '../../shared/notifications';
import { sendPush } from '../src/lib/push';
import * as firebase from '../src/lib/firebase';
import * as email from '../src/lib/email';
import { clearAuth, clearFirestore, getDb, writeUser } from './helpers';

/**
 * Who gets a push, who gets an email instead, and — mostly — who gets neither.
 *
 * FCM has no emulator, so `sendEachForMulticast` is stubbed with the shape it
 * really returns: one result per token, in the order they went in. That is the
 * only fiction here; the preferences, the token lookups and the decision about
 * who the push missed all run for real, because those are what would silently
 * mail somebody who asked not to be mailed.
 *
 * `sendEmail` is spied on rather than stubbed out, so these assert on the uids
 * handed to the fallback. What it then does with them is `email.test.ts`.
 */

const ANNA = 'anna';
const JOHAN = 'johan';

const PAYLOAD = buildGamePush('cancelled', {
	when: 'Tue 1 Sep · 19:00',
	url: '/s/spring/g/game-1',
	gameId: 'game-1',
});

const writeToken = (uid: string, token: string) =>
	getDb().doc(`users/${uid}/pushTokens/${token}`).set({ token, createdAt: '2026-08-01T00:00:00.000Z' });

/** One FCM result per token sent, in order. `true` succeeded, `false` didn't. */
const fcmReturns = (...outcomes: boolean[]) => {
	const sendEachForMulticast = jest.fn().mockResolvedValue({
		successCount: outcomes.filter(Boolean).length,
		responses: outcomes.map(success =>
			success ? { success: true } : { success: false, error: { code: 'messaging/internal-error' } }
		),
	});

	jest.spyOn(firebase, 'messaging').mockReturnValue({ sendEachForMulticast } as never);

	return sendEachForMulticast;
};

/**
 * Records who the fallback was asked to mail, and reports each one as sent.
 *
 * Returns a reader rather than the spy: what matters is which uids reached the
 * fallback, not whether it was called — an empty list is `sendPush` deciding
 * nobody needs one, which is the same outcome as not asking.
 */
const captureEmails = () => {
	const spy = jest.spyOn(email, 'sendEmail').mockImplementation(async uids => uids.length);

	return () => spy.mock.calls.flatMap(([uids]) => uids);
};

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

afterEach(() => jest.restoreAllMocks());

describe('sendPush', () => {
	it('emails somebody who has no device registered at all', async () => {
		await writeUser(ANNA);
		const emailed = captureEmails();

		expect(await sendPush([ANNA], PAYLOAD, 'gameChanges')).toEqual({ pushed: 0, emailed: 1 });
		expect(emailed()).toEqual([ANNA]);
	});

	// The opt-out has to hold on both channels, or switching cancellations off
	// just changes which inbox they arrive in.
	it('never emails somebody who switched that kind off', async () => {
		await writeUser(ANNA, { notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, gameChanges: false } });
		const emailed = captureEmails();

		expect(await sendPush([ANNA], PAYLOAD, 'gameChanges')).toEqual({ pushed: 0, emailed: 0 });
		expect(emailed()).toEqual([]);
	});

	it('does not email somebody the push reached', async () => {
		await writeUser(ANNA);
		await writeToken(ANNA, 'token-a');
		fcmReturns(true);
		const emailed = captureEmails();

		expect(await sendPush([ANNA], PAYLOAD, 'gameChanges')).toEqual({ pushed: 1, emailed: 0 });
		expect(emailed()).toEqual([]);
	});

	// A registered device is no guarantee of delivery — the token can be stale,
	// or FCM can simply fail — and silence would look identical from the phone.
	it('falls back to email when every one of their tokens fails', async () => {
		await writeUser(ANNA);
		await writeToken(ANNA, 'token-a');
		await writeToken(ANNA, 'token-b');
		fcmReturns(false, false);
		const emailed = captureEmails();

		expect(await sendPush([ANNA], PAYLOAD, 'gameChanges')).toEqual({ pushed: 0, emailed: 1 });
		expect(emailed()).toEqual([ANNA]);
	});

	// Per person, not per token. Somebody whose phone buzzed has heard about it,
	// and a mail because their old laptop didn't answer is the duplicate this
	// whole arrangement exists to avoid.
	it('counts a person as reached when any one of their devices was', async () => {
		await writeUser(ANNA);
		await writeToken(ANNA, 'token-a');
		await writeToken(ANNA, 'token-b');
		fcmReturns(true, false);
		const emailed = captureEmails();

		expect(await sendPush([ANNA], PAYLOAD, 'gameChanges')).toEqual({ pushed: 1, emailed: 0 });
		expect(emailed()).toEqual([]);
	});

	it('emails only the people the push missed', async () => {
		await writeUser(ANNA);
		await writeUser(JOHAN);
		await writeToken(ANNA, 'token-a');
		fcmReturns(true);
		const emailed = captureEmails();

		expect(await sendPush([ANNA, JOHAN], PAYLOAD, 'gameChanges')).toEqual({ pushed: 1, emailed: 1 });
		expect(emailed()).toEqual([JOHAN]);
	});

	// Absent prefs means opted in, matching `getPushReach` and `tokensFor`
	// before it — a profile written before a preference existed must not read
	// as switched off.
	it('treats a profile with no preferences as opted in', async () => {
		await getDb().doc(`users/${ANNA}`).set({ uid: ANNA, displayName: 'Anna' });
		const emailed = captureEmails();

		expect(await sendPush([ANNA], PAYLOAD, 'gameChanges')).toEqual({ pushed: 0, emailed: 1 });
		expect(emailed()).toEqual([ANNA]);
	});

	it('does nothing at all when nobody was named', async () => {
		const emailed = captureEmails();

		expect(await sendPush([], PAYLOAD, 'gameChanges')).toEqual({ pushed: 0, emailed: 0 });
		expect(emailed()).toEqual([]);
	});

	// Otherwise every send keeps paying for devices that no longer exist.
	it('deletes tokens FCM reports as dead, and still emails their owner', async () => {
		await writeUser(ANNA);
		await writeToken(ANNA, 'dead-token');
		jest.spyOn(firebase, 'messaging').mockReturnValue({
			sendEachForMulticast: jest.fn().mockResolvedValue({
				successCount: 0,
				responses: [{ success: false, error: { code: 'messaging/registration-token-not-registered' } }],
			}),
		} as never);
		const emailed = captureEmails();

		expect(await sendPush([ANNA], PAYLOAD, 'gameChanges')).toEqual({ pushed: 0, emailed: 1 });
		expect(emailed()).toEqual([ANNA]);

		const tokens = await getDb().collection(`users/${ANNA}/pushTokens`).get();
		expect(tokens.empty).toBe(true);
	});
});
