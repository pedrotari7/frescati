/**
 * Prints a user's Firebase Auth record and custom claims — the quickest way to
 * confirm an admin grant landed, since claims aren't visible in the console UI.
 *
 * Usage: pnpm --filter backend whoami you@example.com
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const main = async () => {
	const [email] = process.argv.slice(2);

	if (!email) {
		console.error('Usage: pnpm --filter backend whoami <email>');
		process.exit(1);
	}

	const firebaserc = JSON.parse(readFileSync(join(__dirname, '..', '..', '.firebaserc'), 'utf8'));
	const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? firebaserc.projects.default;

	process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId;
	initializeApp({ credential: applicationDefault(), projectId });

	const user = await getAuth().getUserByEmail(email);

	console.log({
		uid: user.uid,
		email: user.email,
		displayName: user.displayName,
		claims: user.customClaims ?? {},
		isAppAdmin: user.customClaims?.admin === true,
		created: user.metadata.creationTime,
		lastSignIn: user.metadata.lastSignInTime,
	});
};

main().catch(error => {
	console.error(error.message ?? error);
	process.exit(1);
});
