import type { NotificationPrefs } from '../../../shared/types';
import type { GameNotification, GameNotificationContext, PushPayload } from '../../../shared/notifications';
import { NOTIFICATION_PREF, buildGamePush } from '../../../shared/notifications';
import { db, messaging } from './firebase';
import { sendEmail } from './email';
import { reportError } from './sentry';

export type NotificationKind = keyof NotificationPrefs;

/**
 * Which profile switch silences a send, or `null` for a kind whose opt-in lives
 * somewhere more specific than the profile. See `NOTIFICATION_PREF`.
 *
 * `null` skips the *kind* check only. `emailFallback` still applies, because
 * that one picks a channel rather than a kind: somebody who never wants mail
 * from Frescati doesn't want it for a game they followed either.
 */
export type NotificationGate = NotificationKind | null;

export type { PushPayload };

/** What one notification actually managed to do. */
export interface SendResult {
	/** Devices FCM accepted the message for. */
	pushed: number;
	/** People it reached by email instead, having reached none of their devices. */
	emailed: number;
}

/** Firebase reports these when a device has uninstalled or reset the app. */
const DEAD_TOKEN_CODES = new Set([
	'messaging/registration-token-not-registered',
	'messaging/invalid-registration-token',
	'messaging/invalid-argument',
]);

interface Recipient {
	uid: string;
	/** Empty when they have no device registered, which is not the same as opted out. */
	tokens: string[];
	/** Whether the preference gating this kind is switched on. */
	wants: boolean;
}

/**
 * Everyone this notification is for, and what we know about reaching them.
 *
 * Returns the opted-out alongside the rest rather than dropping them, because
 * the two used to be indistinguishable here. Both came back as an empty token
 * list, and the email fallback has to tell them apart. Somebody who switched
 * cancellations off must not be emailed the cancellation instead.
 */
const resolveRecipients = async (uids: string[], gate: NotificationGate): Promise<Recipient[]> =>
	Promise.all(
		uids.map(async uid => {
			const [userSnap, tokensSnap] = await Promise.all([
				db.doc(`users/${uid}`).get(),
				db.collection(`users/${uid}/pushTokens`).get(),
			]);

			const prefs = userSnap.data()?.notificationPrefs as NotificationPrefs | undefined;

			return {
				uid,
				tokens: tokensSnap.docs.map(doc => doc.id),
				// Absent prefs means opted in. The defaults are on. So does a
				// `null` gate, for a kind the caller already established consent
				// for; the profile has no switch to read.
				wants: gate === null || prefs?.[gate] !== false,
			};
		})
	);

/**
 * Send a notification to a set of users, by push where possible and email where
 * not.
 *
 * **Data-only on purpose.** With no `notification` key, FCM hands the message
 * straight to our service worker's `push` listener instead of rendering it
 * itself, which is what lets one hand-written worker own both push and offline
 * caching. Adding a `notification` block here would produce duplicate banners.
 *
 * The email fallback lives in here rather than at the call sites so that every
 * trigger gets it on the same terms, and so the rule about who deserves one is
 * written once: the preference for this kind is on, and FCM delivered to none
 * of their devices, because they have none registered, or because every token
 * they do have is dead. Anyone a push reached is never also emailed.
 */
export const sendPush = async (uids: string[], payload: PushPayload, gate: NotificationGate): Promise<SendResult> => {
	if (uids.length === 0) return { pushed: 0, emailed: 0 };

	const recipients = await resolveRecipients(uids, gate);
	const wanted = recipients.filter(recipient => recipient.wants);
	const targets = wanted.flatMap(({ uid, tokens }) => tokens.map(token => ({ uid, token })));

	if (targets.length === 0) {
		return {
			pushed: 0,
			emailed: await sendEmail(
				wanted.map(({ uid }) => uid),
				payload
			),
		};
	}

	const response = await messaging().sendEachForMulticast({
		tokens: targets.map(target => target.token),
		data: {
			title: payload.title,
			body: payload.body,
			url: payload.url,
			tag: payload.tag,
			// Every FCM data value is a string, so the worker reads this back as
			// one rather than as a boolean.
			respondable: payload.respondable ? '1' : '0',
		},
		webpush: {
			// Hold undelivered messages for a day; a reminder about tomorrow is
			// useless a week later.
			headers: { TTL: '86400', Urgency: 'high' },
			fcmOptions: { link: payload.url },
		},
	});

	const results = response.responses.map((result, index) => ({ result, target: targets[index] }));

	// Clean up tokens for devices that no longer exist, otherwise every send
	// keeps paying for them.
	const stale = results.filter(({ result }) => result.error && DEAD_TOKEN_CODES.has(result.error.code));

	await Promise.all(
		stale.map(({ target }) =>
			db
				.doc(`users/${target.uid}/pushTokens/${target.token}`)
				.delete()
				// Swallowed deliberately. One token that won't delete must not fail
				// the send it was found in. But silently: a persistent failure here
				// (a rules regression, a permissions change) would mean the same
				// dead tokens get resent to, and re-fail to clean up, on every
				// notification forever, with nothing to notice but a shrinking
				// success rate nobody is watching. reportError is what surfaces it.
				.catch(error => reportError('Could not delete a dead push token', { uid: target.uid }, error))
		)
	);

	// Per person, not per token: two phones where one succeeded is a person who
	// heard about it, and mailing them as well would be the duplicate this whole
	// arrangement exists to avoid.
	const reached = new Set(results.filter(({ result }) => result.success).map(({ target }) => target.uid));
	const missed = wanted.filter(({ uid }) => !reached.has(uid)).map(({ uid }) => uid);

	return { pushed: response.successCount, emailed: await sendEmail(missed, payload) };
};

/**
 * Send one of the app's known game notifications.
 *
 * The only way any of them should be sent: taking the kind rather than a
 * payload means the copy and the preference that silences it can't be paired up
 * wrongly, and `sendTestPush` reaches a device through exactly the same call
 * every real trigger makes.
 */
export const sendGamePush = (
	uids: string[],
	kind: GameNotification,
	context: GameNotificationContext
): Promise<SendResult> => sendPush(uids, buildGamePush(kind, context), NOTIFICATION_PREF[kind]);
