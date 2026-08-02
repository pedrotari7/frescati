/**
 * Bootstraps an app admin — the one thing that can't be done from inside the
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
 * The target must have signed into the app at least once — this looks them up
 * in Firebase Auth by email, it doesn't create accounts.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_NOTIFICATION_PREFS } from '../../shared/types';

/**
 * Application-default credentials from `gcloud` carry no project, unlike a
 * service account key — so read it from the same place the CLI does.
 */
const resolveProjectId = (): string => {
	if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;

	const firebaserc = JSON.parse(readFileSync(join(__dirname, '..', '..', '.firebaserc'), 'utf8'));
	const projectId = firebaserc?.projects?.default;

	if (!projectId) throw new Error('No project id in .firebaserc and GOOGLE_CLOUD_PROJECT is unset.');

	return projectId;
};

const main = async () => {
	const [email] = process.argv.slice(2).filter(argument => !argument.startsWith('--'));
	const revoke = process.argv.includes('--revoke');

	if (!email) {
		console.error('Usage: pnpm --filter backend set-admin <email> [--revoke]');
		process.exit(1);
	}

	const projectId = resolveProjectId();

	// User-based ADC (from `gcloud auth application-default login`) carries no
	// quota project, and the Identity Toolkit API refuses to serve without one.
	// Service account keys don't need this, but setting it is harmless there.
	process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId;

	initializeApp({ credential: applicationDefault(), projectId });

	const user = await getAuth().getUserByEmail(email);

	await getAuth().setCustomUserClaims(user.uid, revoke ? {} : { admin: true });

	// The claim is the real grant; the Firestore field is only a display mirror.
	// It has to be merged into a *whole* profile though: a bare `{ isAppAdmin }`
	// doc has no `displayName`, so its owner renders as "Unknown player" in every
	// roster, and no `uid`, which the update rule requires — so the app could
	// never repair it either. Someone can reach here without a profile doc by
	// signing in before the rules were deployed, or by having their first-visit
	// write fail for any other reason.
	const ref = getFirestore().doc(`users/${user.uid}`);
	const existing = await ref.get();
	const now = new Date().toISOString();

	await ref.set(
		{
			uid: user.uid,
			displayName: user.displayName ?? user.email?.split('@')[0] ?? 'Player',
			email: user.email ?? '',
			photoURL: user.photoURL ?? null,
			createdAt: existing.get('createdAt') ?? now,
			lastSeenAt: existing.get('lastSeenAt') ?? now,
			isAppAdmin: !revoke,
			notificationPrefs: existing.get('notificationPrefs') ?? DEFAULT_NOTIFICATION_PREFS,
		},
		{ merge: true }
	);

	console.log(`${revoke ? 'Revoked' : 'Granted'} app admin for ${email} (${user.uid}) on ${projectId}.`);
	console.log('Takes effect on their next token refresh — the app forces one every 10 minutes.');
};

main().catch((error: { code?: string; message?: string }) => {
	if (error.code === 'auth/user-not-found') {
		console.error('No such user. They need to sign into the app once before you can promote them.');
		process.exit(1);
	}

	if (error.message?.includes('Could not load the default credentials')) {
		console.error('No credentials. Run:  gcloud auth application-default login');
		process.exit(1);
	}

	console.error(error);
	process.exit(1);
});
