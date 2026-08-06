import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { PushDevice, PushToken } from '../../shared/types';
import { describeUserAgent } from '../../shared/device';
import { db, REGION } from './lib/firebase';

/**
 * Which devices each account has registered for push, for the admin
 * notification screen.
 *
 * A callable rather than a Firestore read because the client is not allowed
 * anywhere near this data: a registration token is a capability to push to
 * somebody's phone, so `users/{uid}/pushTokens` is private to its owner and
 * stays that way. Relaxing that rule to let admins list the collection would
 * hand every admin a working send-anything token for every device in the group,
 * to answer a question that only needs a count and a platform.
 *
 * So this reads the tokens with the Admin SDK and returns everything *except*
 * the token. The screen learns that Anna has an iPhone registered since
 * Tuesday; nothing that reaches the browser could be used to send to it.
 *
 * One unfiltered collection-group query over what is, by design, one football
 * group's worth of devices — a handful per person at most. Not realtime, unlike
 * the rest of the app: this is a diagnostic screen an admin opens when somebody
 * says notifications aren't arriving, and a token appearing a few seconds late
 * changes nothing about the answer.
 */
export const getPushDevices = onCall({ region: REGION }, async request => {
	if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
	if (request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'App admins only.');

	const snapshot = await db.collectionGroup('pushTokens').get();

	const devices: Record<string, PushDevice[]> = {};

	for (const token of snapshot.docs) {
		// `users/{uid}/pushTokens/{token}` — the grandparent is the account. A
		// collection group query can only be scoped by collection id, so the uid
		// comes off the path rather than out of the document.
		const uid = token.ref.parent.parent?.id;
		if (!uid) continue;

		const data = token.data() as Partial<PushToken>;

		devices[uid] ??= [];
		devices[uid].push({
			...describeUserAgent(data.userAgent ?? ''),
			registeredAt: data.createdAt ?? '',
		});
	}

	// Newest first, so the device somebody is holding while they complain that
	// nothing arrives is the one at the top of their row.
	for (const list of Object.values(devices)) list.sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));

	return { devices };
});
