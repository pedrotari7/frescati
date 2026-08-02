/**
 * Backfills `kickoffMillis` onto games written before the field existed.
 *
 * Security rules enforce the response deadline against this number, because
 * they have no way to parse the ISO 8601 `kickoff`. Games missing it fall back
 * to a far-future default in the rules — answerable forever, exactly as they
 * were before — so this script is what actually turns the deadline on for the
 * existing calendar.
 *
 * Safe to run repeatedly: games that already carry a correct value are skipped.
 *
 * Usage:
 *   pnpm --filter backend backfill-kickoff-millis
 *   pnpm --filter backend backfill-kickoff-millis --dry-run
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

	// Collection group: games live under every season, and this has to reach all
	// of them regardless of how many seasons exist.
	const games = await db.collectionGroup('games').get();

	const stale = games.docs.filter(doc => {
		const { kickoff, kickoffMillis } = doc.data() as { kickoff?: string; kickoffMillis?: number };
		if (!kickoff) return false;

		return kickoffMillis !== Date.parse(kickoff);
	});

	console.log(`${games.size} games, ${stale.length} needing kickoffMillis.`);

	if (stale.length === 0) {
		console.log('Nothing to do.');
		return;
	}

	if (dryRun) {
		for (const doc of stale.slice(0, 10)) {
			console.log(`  would set ${doc.ref.path} -> ${Date.parse((doc.data() as { kickoff: string }).kickoff)}`);
		}
		if (stale.length > 10) console.log(`  ...and ${stale.length - 10} more`);
		console.log('\nDry run, nothing written.');
		return;
	}

	for (let start = 0; start < stale.length; start += BATCH_LIMIT) {
		const batch = db.batch();

		for (const doc of stale.slice(start, start + BATCH_LIMIT)) {
			const { kickoff } = doc.data() as { kickoff: string };
			batch.update(doc.ref, { kickoffMillis: Date.parse(kickoff) });
		}

		await batch.commit();
		console.log(`  wrote ${Math.min(start + BATCH_LIMIT, stale.length)}/${stale.length}`);
	}

	console.log('\nDone. The response deadline is now enforced for every game.');
};

main().catch((error: { message?: string }) => {
	if (error.message?.includes('Could not load the default credentials')) {
		console.error('No credentials. Run:  gcloud auth application-default login');
		process.exit(1);
	}

	console.error(error);
	process.exit(1);
});
