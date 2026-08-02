import type { NotificationPrefs } from '../../../shared/types';
import { db, messaging } from './firebase';

export type NotificationKind = keyof NotificationPrefs;

export interface PushPayload {
	title: string;
	body: string;
	/** Deep link opened on tap. */
	url: string;
	/** Notifications sharing a tag replace each other instead of stacking. */
	tag: string;
}

/** Firebase reports these when a device has uninstalled or reset the app. */
const DEAD_TOKEN_CODES = new Set([
	'messaging/registration-token-not-registered',
	'messaging/invalid-registration-token',
	'messaging/invalid-argument',
]);

const tokensFor = async (uid: string, kind: NotificationKind): Promise<string[]> => {
	const [userSnap, tokensSnap] = await Promise.all([
		db.doc(`users/${uid}`).get(),
		db.collection(`users/${uid}/pushTokens`).get(),
	]);

	const prefs = userSnap.data()?.notificationPrefs as NotificationPrefs | undefined;

	// Opted out of this kind. Absent prefs means opted in — the defaults are on.
	if (prefs && prefs[kind] === false) return [];

	return tokensSnap.docs.map(doc => doc.id);
};

/**
 * Send a notification to a set of users.
 *
 * **Data-only on purpose.** With no `notification` key, FCM hands the message
 * straight to our service worker's `push` listener instead of rendering it
 * itself — which is what lets one hand-written worker own both push and offline
 * caching. Adding a `notification` block here would produce duplicate banners.
 */
export const sendPush = async (uids: string[], payload: PushPayload, kind: NotificationKind): Promise<number> => {
	if (uids.length === 0) return 0;

	const tokenLists = await Promise.all(uids.map(uid => tokensFor(uid, kind).then(tokens => ({ uid, tokens }))));
	const targets = tokenLists.flatMap(({ uid, tokens }) => tokens.map(token => ({ uid, token })));

	if (targets.length === 0) return 0;

	const response = await messaging().sendEachForMulticast({
		tokens: targets.map(target => target.token),
		data: {
			title: payload.title,
			body: payload.body,
			url: payload.url,
			tag: payload.tag,
		},
		webpush: {
			// Hold undelivered messages for a day; a reminder about tomorrow is
			// useless a week later.
			headers: { TTL: '86400', Urgency: 'high' },
			fcmOptions: { link: payload.url },
		},
	});

	// Clean up tokens for devices that no longer exist, otherwise every send
	// keeps paying for them.
	const stale = response.responses
		.map((result, index) => ({ result, target: targets[index] }))
		.filter(({ result }) => result.error && DEAD_TOKEN_CODES.has(result.error.code));

	await Promise.all(
		stale.map(({ target }) => db.doc(`users/${target.uid}/pushTokens/${target.token}`).delete().catch(() => undefined))
	);

	return response.successCount;
};
