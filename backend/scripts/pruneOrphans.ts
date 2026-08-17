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

import type { DocumentReference } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { runScript } from './lib/script';
import type { ScriptContext } from './lib/script';

/** Which of these documents don't exist, looked up in one round trip. */
const missingAmong = async (refs: DocumentReference[]): Promise<Set<string>> => {
	if (refs.length === 0) return new Set();

	const snaps = await getFirestore().getAll(...refs);

	return new Set(snaps.filter(snap => !snap.exists).map(snap => snap.ref.path));
};

export const main = async ({ db, dryRun }: ScriptContext) => {
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
		for (const doc of [...orphanGames, ...orphanResponses].slice(0, 20))
			console.log(`  would delete ${doc.ref.path}`);
		console.log('\nDry run, nothing written.');
		return;
	}

	// recursiveDelete rather than a plain delete: an orphaned game has its own
	// orphaned responses hanging off it.
	for (const doc of orphanGames) await db.recursiveDelete(doc.ref);
	for (const doc of orphanResponses) await doc.ref.delete();

	console.log(`\nDeleted ${orphanGames.length} games and ${orphanResponses.length} responses.`);
};

// Only when run as a command, so a test can import `main` and drive it
// against the emulators without `runScript` reaching for real credentials.
if (require.main === module) runScript(main);
