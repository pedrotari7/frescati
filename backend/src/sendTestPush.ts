import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import type { NotificationPrefs } from '../../shared/types';
import type { AppNotification, GameNotification } from '../../shared/notifications';
import { NOTIFICATIONS, NOTIFICATION_PREF } from '../../shared/notifications';
import { db, REGION } from './lib/firebase';
import { EMAIL_SECRETS } from './lib/email';
import { sendPush } from './lib/push';
import { buildTestPayload } from './lib/testNotifications';
import { requireAppAdmin } from './lib/auth';
import { instrument } from './lib/sentry';

/**
 * Sends one of the real notifications to the caller's own devices.
 *
 * There is no other way to test push honestly. Firebase has no Cloud Messaging
 * emulator, so a notification only exists once something server-side asks FCM
 * for it — and the events that do are awkward to stage: `atRisk` fires on an
 * edge that only somebody else's response can cross, and reminders are a
 * scheduled sweep gated on a window that is recorded as sent forever after.
 *
 * Deliberately narrow, because this exists in production:
 *   - app admins only;
 *   - it always sends to `request.auth.uid`, never to a uid from the request,
 *     so it cannot be turned into a way to notify somebody else;
 *   - it builds its payload with the same builders every real trigger uses and
 *     sends it down the same `sendPush`, preferences and dead-token cleanup
 *     included, rather than reaching for `messaging()` itself. A debug path
 *     that skips the checks stops testing the thing it is there to test.
 *
 * That last point is why it is also the only honest test of the email fallback:
 * an admin with no device registered gets the mail here on exactly the terms a
 * player would, and there is no Resend sandbox worth standing up locally.
 */
export const sendTestPush = onCall<{ kind: GameNotification | AppNotification; seasonId?: string; gameId?: string }>(
	{ region: REGION, secrets: EMAIL_SECRETS },
	instrument('sendTestPush', async request => {
		const uid = requireAppAdmin(request);

		const { kind, seasonId, gameId } = request.data;

		if (!NOTIFICATIONS.includes(kind)) {
			throw new HttpsError('invalid-argument', `Unknown notification kind: ${kind}`);
		}


		// Read these alongside the send so a silent result can say which of the
		// two reasons it was. "Nothing happened" is the least useful thing a
		// debug button can report, and both causes are invisible from the phone.
		const [tokensSnap, userSnap] = await Promise.all([
			db.collection(`users/${uid}/pushTokens`).get(),
			db.doc(`users/${uid}`).get(),
		]);

		const prefs = userSnap.data()?.notificationPrefs as NotificationPrefs | undefined;
		const gate = NOTIFICATION_PREF[kind];
		// Absent prefs means opted in — the defaults are on, same as `tokensFor`.
		// So does a kind with no switch behind it: `availability` is gated by
		// following a game rather than by the profile, and this screen sends
		// without one, so there is nothing here that could be off.
		const prefEnabled = gate === null || prefs?.[gate] !== false;

		// Built here rather than inside `sendGamePush` only so it can be handed
		// back to the caller: the screen shows the copy that actually went out,
		// which is worth more than a preview it composed itself and would have
		// to keep in step. Both the payload and the preference still come from
		// `kind`, so they cannot be paired up wrongly.
		const payload = await buildTestPayload(kind, {
			sender: { uid, displayName: (userSnap.data()?.displayName as string | undefined) ?? '' },
			seasonId,
			gameId,
		});
		const { pushed, emailed } = await sendPush([uid], payload, gate);

		logger.info('Sent a test notification', { uid, kind, pushed, emailed, devices: tokensSnap.size, prefEnabled });

		// `sent` rather than `pushed` in the response: it is the field the screen
		// has always read, and renaming it would only rename it back on the other
		// side. `emailed` sits next to it because the fallback is invisible from
		// the phone in exactly the way push is — the whole reason this exists.
		return { sent: pushed, emailed, devices: tokensSnap.size, prefEnabled, payload };
	})
);
