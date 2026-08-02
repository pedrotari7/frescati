/**
 * Removes `email` from profiles written before it moved out of Firestore.
 *
 * `users/{uid}` is readable by every signed-in user — that is what makes
 * rosters and the member picker work — so it holds a name, an avatar and a
 * badge and nothing else. Firebase Auth keeps the address, where no client can
 * read it.
 *
 * Signing in clears the field, so most people heal on their own. This catches
 * anyone who hasn't been back since.
 *
 * Safe to run repeatedly: profiles with no email are skipped.
 *
 * Usage:
 *   pnpm --filter backend strip-user-emails
 *   pnpm --filter backend strip-user-emails --dry-run
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 500;

const resolveProjectId = (): string => {
	if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;

	const firebaserc = JSON.parse(readFileSync(join(__dirname, '..', '..', '.firebaserc'), 'utf8'));
	const projectId = firebaserc?.projects?.default;

	if (!projectId) throw new Error('No project id in .firebaserc and GOOGLE_CLOUD_PROJECT is unset.');

	return projectId;
};

const main = async () => {
	const dryRun = process.argv.includes('--dry-run');
	const projectId = resolveProjectId();

	process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId;
	initializeApp({ credential: applicationDefault(), projectId });

	const db = getFirestore();
	const users = await db.collection('users').get();
	const withEmail = users.docs.filter(doc => doc.get('email') !== undefined);

	console.log(`${users.size} profiles, ${withEmail.length} still carrying an email.`);

	if (withEmail.length === 0) {
		console.log('Nothing to do.');
		return;
	}

	if (dryRun) {
		for (const doc of withEmail.slice(0, 10)) console.log(`  would strip ${doc.id}`);
		if (withEmail.length > 10) console.log(`  ...and ${withEmail.length - 10} more`);
		console.log('\nDry run, nothing written.');
		return;
	}

	for (let start = 0; start < withEmail.length; start += BATCH_LIMIT) {
		const batch = db.batch();

		for (const doc of withEmail.slice(start, start + BATCH_LIMIT)) {
			batch.update(doc.ref, { email: FieldValue.delete() });
		}

		await batch.commit();
		console.log(`  stripped ${Math.min(start + BATCH_LIMIT, withEmail.length)}/${withEmail.length}`);
	}

	console.log('\nDone. No profile carries a contact address any more.');
};

main().catch((error: { message?: string }) => {
	if (error.message?.includes('Could not load the default credentials')) {
		console.error('No credentials. Run:  gcloud auth application-default login');
		process.exit(1);
	}

	console.error(error);
	process.exit(1);
});
