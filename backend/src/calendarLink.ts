import { randomBytes } from 'node:crypto';
import { getApps } from 'firebase-admin/app';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { Season } from '../../shared/types';
import { db, REGION } from './lib/firebase';
import { hasAppAdminClaim, isSeasonAdmin, requireAuth } from './lib/auth';
import { instrument } from './lib/sentry';

/**
 * The subscribable calendar link, per season — see `shared/calendar.ts` for
 * the feed itself and `calendarFeed.ts` for what serves it.
 *
 * One shared link per season, not one per person: a calendar app polls with a
 * plain unauthenticated `GET`, so the token in the URL *is* the auth, and that
 * matches how everything else here already works — "anyone signed in can read
 * everything", just handed to whoever holds the link instead of whoever is
 * signed in. Rotating it (below) is the only way to close a leaked copy, and
 * it closes every copy at once, which is why it is season-admin only.
 *
 * Both the token and its reverse index (`calendarFeeds/{token}`) are closed to
 * every client — see `firestore.rules` — so this and `rotateCalendarToken` are
 * the only two places either document is ever read or written.
 */

/** 32 random bytes, base64url — long enough that guessing one is not a real attack surface. */
const newToken = (): string => randomBytes(32).toString('base64url');

const projectId = (): string =>
	getApps()[0]?.options.projectId ?? process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? '';

const feedUrl = (token: string): string =>
	`https://${REGION}-${projectId()}.cloudfunctions.net/calendarFeed?token=${token}`;

export const getCalendarLink = onCall<{ seasonId: string }>(
	{ region: REGION },
	instrument('getCalendarLink', async request => {
		const callerUid = requireAuth(request);

		const { seasonId } = request.data;
		if (!seasonId) throw new HttpsError('invalid-argument', 'A seasonId is required.');

		const seasonSnap = await db.doc(`seasons/${seasonId}`).get();
		if (!seasonSnap.exists) throw new HttpsError('not-found', 'That season does not exist.');

		const tokenRef = db.doc(`seasons/${seasonId}/calendar/token`);

		// Read and write inside one transaction so two people tapping "Subscribe"
		// at once can't both see nothing there and mint two tokens — the second
		// would leave the first's reverse index orphaned, pointing at a token
		// nothing hands out any more.
		const token = await db.runTransaction(async transaction => {
			const existing = await transaction.get(tokenRef);
			if (existing.exists) return (existing.data() as { token: string }).token;

			const minted = newToken();
			const now = new Date().toISOString();

			transaction.set(tokenRef, { token: minted, createdAt: now, createdBy: callerUid });
			transaction.set(db.doc(`calendarFeeds/${minted}`), { seasonId, createdAt: now });

			return minted;
		});

		logger.info('Fetched a calendar link', { seasonId, by: callerUid });

		return { url: feedUrl(token) };
	})
);

export const rotateCalendarToken = onCall<{ seasonId: string }>(
	{ region: REGION },
	instrument('rotateCalendarToken', async request => {
		const callerUid = requireAuth(request);

		const { seasonId } = request.data;
		if (!seasonId) throw new HttpsError('invalid-argument', 'A seasonId is required.');

		const seasonSnap = await db.doc(`seasons/${seasonId}`).get();
		if (!seasonSnap.exists) throw new HttpsError('not-found', 'That season does not exist.');

		const season = seasonSnap.data() as Season;
		if (!isSeasonAdmin(season, callerUid, hasAppAdminClaim(request))) {
			throw new HttpsError('permission-denied', 'Season admins only.');
		}

		const tokenRef = db.doc(`seasons/${seasonId}/calendar/token`);

		const token = await db.runTransaction(async transaction => {
			const existing = await transaction.get(tokenRef);
			const oldToken = existing.exists ? (existing.data() as { token: string }).token : null;

			const minted = newToken();
			const now = new Date().toISOString();

			if (oldToken) transaction.delete(db.doc(`calendarFeeds/${oldToken}`));
			transaction.set(tokenRef, { token: minted, createdAt: now, createdBy: callerUid });
			transaction.set(db.doc(`calendarFeeds/${minted}`), { seasonId, createdAt: now });

			return minted;
		});

		logger.info('Rotated a calendar link', { seasonId, by: callerUid });

		return { url: feedUrl(token) };
	})
);
