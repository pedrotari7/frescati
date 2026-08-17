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

import { FieldValue } from 'firebase-admin/firestore';
import { applyUpdates, runScript } from './lib/script';
import type { ScriptContext } from './lib/script';

export const main = async ({ db, dryRun }: ScriptContext) => {
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

	await applyUpdates(
		db,
		withEmail.map(doc => ({ ref: doc.ref, data: { email: FieldValue.delete() } })),
		'stripped'
	);

	console.log('\nDone. No profile carries a contact address any more.');
};

// Only when run as a command, so a test can import `main` and drive it
// against the emulators without `runScript` reaching for real credentials.
if (require.main === module) runScript(main);
