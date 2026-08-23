/**
 * Bootstraps an app admin. It is the one thing that can't be done from inside the
 * app, since granting admin requires already being one.
 *
 * Usage:
 *   pnpm --filter backend set-admin you@example.com
 *   pnpm --filter backend set-admin them@example.com --revoke
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *
 * The target must have signed into the app at least once. This looks them up
 * in Firebase Auth by email, it doesn't create accounts.
 */

import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { DEFAULT_NOTIFICATION_PREFS } from '../../shared/types';
import { UsageError, runScript } from './lib/script';
import type { ScriptContext } from './lib/script';

const main = async ({ db, projectId, args }: ScriptContext) => {
	const [email] = args;
	const revoke = process.argv.includes('--revoke');

	if (!email) throw new UsageError('Usage: pnpm --filter backend set-admin <email> [--revoke]');

	const user = await getAuth().getUserByEmail(email);

	await getAuth().setCustomUserClaims(user.uid, revoke ? {} : { admin: true });

	// The claim is the real grant; the Firestore field is only a display mirror.
	// It has to be merged into a *whole* profile though: a bare `{ isAppAdmin }`
	// doc has no `displayName`, so its owner renders as "Unknown player" in every
	// roster, and no `uid`, which the update rule requires, so the app could
	// never repair it either. Someone can reach here without a profile doc by
	// signing in before the rules were deployed, or by having their first-visit
	// write fail for any other reason.
	const ref = db.doc(`users/${user.uid}`);
	const existing = await ref.get();
	const now = new Date().toISOString();

	await ref.set(
		{
			uid: user.uid,
			displayName: user.displayName ?? user.email?.split('@')[0] ?? 'Player',
			// No contact details in a profile every signed-in user can read.
			// Firebase Auth is where the address lives.
			email: FieldValue.delete(),
			photoURL: user.photoURL ?? null,
			createdAt: existing.get('createdAt') ?? now,
			lastSeenAt: existing.get('lastSeenAt') ?? now,
			isAppAdmin: !revoke,
			notificationPrefs: existing.get('notificationPrefs') ?? DEFAULT_NOTIFICATION_PREFS,
		},
		{ merge: true }
	);

	console.log(`${revoke ? 'Revoked' : 'Granted'} app admin for ${email} (${user.uid}) on ${projectId}.`);
	console.log('Takes effect on their next token refresh. The app forces one every 10 minutes.');
};

runScript(main);
