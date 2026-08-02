/**
 * Deletes responses and games left behind by deletions that happened before the
 * cascade triggers existed.
 *
 * Firestore doesn't delete subcollections with their parent, so every game
 * deleted from the admin screen left its answers in place — unreachable through
 * the app, but still returned by the collection-group query behind "my answers
 * across every game", and still readable by anyone signed in.
 *
 * Safe to run repeatedly.
 *
 * Usage:
 *   pnpm --filter backend prune-orphans
 *   pnpm --filter backend prune-orphans --dry-run
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import type { DocumentReference } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';

const resolveProjectId = (): string => {
	if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;

	const firebaserc = JSON.parse(readFileSync(join(__dirname, '..', '..', '.firebaserc'), 'utf8'));
	const projectId = firebaserc?.projects?.default;

	if (!projectId) throw new Error('No project id in .firebaserc and GOOGLE_CLOUD_PROJECT is unset.');

	return projectId;
};

/** Which of these documents don't exist, looked up in one round trip. */
const missingAmong = async (refs: DocumentReference[]): Promise<Set<string>> => {
	if (refs.length === 0) return new Set();

	const snaps = await getFirestore().getAll(...refs);

	return new Set(snaps.filter(snap => !snap.exists).map(snap => snap.ref.path));
};

const main = async () => {
	const dryRun = process.argv.includes('--dry-run');
	const projectId = resolveProjectId();

	process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId;
	initializeApp({ credential: applicationDefault(), projectId });

	const db = getFirestore();

	// Games whose season is gone.
	const gamesSnap = await db.collectionGroup('games').get();
	const seasonRefs = [...new Set(gamesSnap.docs.map(doc => doc.ref.parent.parent!.path))].map(path => db.doc(path));
	const deadSeasons = await missingAmong(seasonRefs);
	const orphanGames = gamesSnap.docs.filter(doc => deadSeasons.has(doc.ref.parent.parent!.path));

	// Responses whose game is gone — including the ones about to be, above.
	const responsesSnap = await db.collectionGroup('responses').get();
	const gameRefs = [...new Set(responsesSnap.docs.map(doc => doc.ref.parent.parent!.path))].map(path => db.doc(path));
	const deadGames = await missingAmong(gameRefs);
	const orphanResponses = responsesSnap.docs.filter(doc => deadGames.has(doc.ref.parent.parent!.path));

	console.log(`${gamesSnap.size} games, ${orphanGames.length} under a season that no longer exists.`);
	console.log(`${responsesSnap.size} responses, ${orphanResponses.length} under a game that no longer exists.`);

	if (orphanGames.length === 0 && orphanResponses.length === 0) {
		console.log('Nothing to do.');
		return;
	}

	if (dryRun) {
		for (const doc of [...orphanGames, ...orphanResponses].slice(0, 20)) console.log(`  would delete ${doc.ref.path}`);
		console.log('\nDry run, nothing written.');
		return;
	}

	// recursiveDelete rather than a plain delete: an orphaned game has its own
	// orphaned responses hanging off it.
	for (const doc of orphanGames) await db.recursiveDelete(doc.ref);
	for (const doc of orphanResponses) await doc.ref.delete();

	console.log(`\nDeleted ${orphanGames.length} games and ${orphanResponses.length} responses.`);
};

main().catch((error: { message?: string }) => {
	if (error.message?.includes('Could not load the default credentials')) {
		console.error('No credentials. Run:  gcloud auth application-default login');
		process.exit(1);
	}

	console.error(error);
	process.exit(1);
});
