import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { DEFAULT_NOTIFICATION_PREFS } from '../../shared/types';
import { db, REGION } from './lib/firebase';
import { requireAppAdmin } from './lib/auth';
import { instrument } from './lib/sentry';

/**
 * Grants or revokes the global `admin` custom claim.
 *
 * The claim is the source of truth — security rules read
 * `request.auth.token.admin`, which needs no extra document read. The
 * `isAppAdmin` field on the user document is only a display mirror so the UI
 * can show a badge, and rules forbid the client from writing it.
 *
 * Bootstrap the first admin with `backend/scripts/setAdmin.ts`; after that this
 * is what the admin screen calls, so promoting somebody doesn't need a laptop
 * with gcloud credentials on it.
 */
export const setAppAdmin = onCall<{ uid: string; isAdmin: boolean }>(
	{ region: REGION },
	instrument('setAppAdmin', async request => {
		const callerUid = requireAppAdmin(request);

		const { uid, isAdmin } = request.data;
		if (!uid) throw new HttpsError('invalid-argument', 'A uid is required.');

		// Removing the last admin would lock everyone out of season creation with no
		// way back in except the bootstrap script.
		if (!isAdmin && uid === callerUid) {
			throw new HttpsError('failed-precondition', 'Ask another admin to remove your own admin rights.');
		}

		// Look the target up rather than trusting the uid. `setCustomUserClaims` on
		// an account that doesn't exist fails as an unhandled internal error, which
		// reaches the caller as a bare 500 with nothing to act on.
		const user = await getAuth()
			.getUser(uid)
			.catch(() => null);

		if (!user) throw new HttpsError('not-found', 'That account no longer exists.');

		// Merge into whatever claims are already there. Writing a bare `{ admin }`
		// silently drops every other claim on the account — there are none today,
		// which is exactly why it would go unnoticed the day there are.
		const claims = { ...(user.customClaims ?? {}) };
		if (isAdmin) claims.admin = true;
		else delete claims.admin;

		await getAuth().setCustomUserClaims(uid, claims);

		// Write a whole profile, not just the badge. A bare `{ isAppAdmin }` merge
		// onto a document that doesn't exist yet creates one with no `displayName`,
		// so its owner renders as "Unknown player" in every roster, and no `uid`,
		// which the update rule requires — leaving the app unable to repair it
		// either. `scripts/setAdmin.ts` was fixed for exactly this; this had the
		// same bug and no test to notice.
		const ref = db.doc(`users/${uid}`);
		const existing = await ref.get();
		const now = new Date().toISOString();

		await ref.set(
			{
				uid,
				displayName: user.displayName ?? user.email?.split('@')[0] ?? 'Player',
				// Profiles are readable by everyone signed in; the address stays in
				// Firebase Auth. Clears it off documents written before that was true.
				email: FieldValue.delete(),
				photoURL: user.photoURL ?? null,
				createdAt: existing.get('createdAt') ?? now,
				lastSeenAt: existing.get('lastSeenAt') ?? now,
				isAppAdmin: isAdmin,
				notificationPrefs: existing.get('notificationPrefs') ?? DEFAULT_NOTIFICATION_PREFS,
			},
			{ merge: true }
		);

		logger.info('Changed app admin rights', { uid, isAdmin, by: callerUid });

		// The claim only reaches the client on their next token refresh — the app
		// forces one every 10 minutes.
		return { ok: true };
	})
);
