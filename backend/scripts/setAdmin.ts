/**
 * Bootstraps the first app admin — the one thing that can't be done from inside
 * the app, since granting admin requires already being one.
 *
 * Usage:
 *   1. Download a service account key:
 *      Firebase console -> Project settings -> Service accounts -> Generate key
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
 *        pnpm --filter backend set-admin you@example.com
 *
 * Pass `--revoke` to take the role away instead.
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const main = async () => {
	const [email] = process.argv.slice(2).filter(argument => !argument.startsWith('--'));
	const revoke = process.argv.includes('--revoke');

	if (!email) {
		console.error('Usage: pnpm --filter backend set-admin <email> [--revoke]');
		process.exit(1);
	}

	if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
		console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service account key file first.');
		process.exit(1);
	}

	initializeApp({ credential: applicationDefault() });

	const user = await getAuth().getUserByEmail(email);

	await getAuth().setCustomUserClaims(user.uid, revoke ? {} : { admin: true });
	await getFirestore().doc(`users/${user.uid}`).set({ isAppAdmin: !revoke }, { merge: true });

	console.log(`${revoke ? 'Revoked' : 'Granted'} app admin for ${email} (${user.uid}).`);
	console.log('They need to sign out and back in, or wait up to 10 minutes, for it to take effect.');
};

main().catch(error => {
	console.error(error);
	process.exit(1);
});
