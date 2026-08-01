import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { db, REGION } from './lib/firebase';

/**
 * Grants or revokes the global `admin` custom claim.
 *
 * The claim is the source of truth — security rules read
 * `request.auth.token.admin`, which needs no extra document read. The
 * `isAppAdmin` field on the user document is only a display mirror so the UI
 * can show a badge, and rules forbid the client from writing it.
 *
 * Bootstrap the first admin with `backend/scripts/setAdmin.ts`; there is
 * deliberately no way to self-promote through the app.
 */
export const setAppAdmin = onCall<{ uid: string; isAdmin: boolean }>({ region: REGION }, async request => {
	if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
	if (request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'App admins only.');

	const { uid, isAdmin } = request.data;
	if (!uid) throw new HttpsError('invalid-argument', 'A uid is required.');

	// Removing the last admin would lock everyone out of season creation with no
	// way back in except the bootstrap script.
	if (!isAdmin && uid === request.auth.uid) {
		throw new HttpsError('failed-precondition', 'Ask another admin to remove your own admin rights.');
	}

	await getAuth().setCustomUserClaims(uid, isAdmin ? { admin: true } : {});
	await db.doc(`users/${uid}`).set({ isAppAdmin: isAdmin }, { merge: true });

	logger.info('Changed app admin rights', { uid, isAdmin, by: request.auth.uid });

	// The claim only reaches the client on their next token refresh — the app
	// forces one every 10 minutes.
	return { ok: true };
});
