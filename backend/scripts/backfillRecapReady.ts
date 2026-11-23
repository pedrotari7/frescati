/**
 * Stamps `recapReadyAt` on every season that was already over before the recap
 * existed, and marks it watched for everybody who played in it.
 *
 * `announceRecapIfReady` only runs when a game is confirmed or called off, so a
 * season that ended before it was deployed would never be stamped, and would
 * have no replay card and no link on anybody's profile. This gives those
 * seasons the stamp the function would have written.
 *
 * It deliberately does **not** do the rest of what the function does. Nobody is
 * notified, and each player who played is marked as having watched it, because
 * a recap of last spring taking over somebody's home screen the morning after a
 * deploy is a surprise and not a send-off. The recap is still there to open.
 *
 * A player with no profile, somebody forgotten since, is skipped rather than
 * written: an update would fail the whole batch, and a set would bring back a
 * profile that was deleted on purpose.
 *
 * Safe to run repeatedly. A stamped season is left alone.
 *
 * Usage:
 *   pnpm --filter backend backfill-recap-ready
 *   pnpm --filter backend backfill-recap-ready --dry-run
 *
 * Against the local emulator instead of the real project:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pnpm --filter backend backfill-recap-ready
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import { FieldValue } from 'firebase-admin/firestore';
import type { DocumentReference } from 'firebase-admin/firestore';
import { readSeasonEnd } from '../src/lib/seasonEnd';
import { applyUpdates, runScript } from './lib/script';
import type { ScriptContext } from './lib/script';

export const main = async ({ db, dryRun }: ScriptContext): Promise<void> => {
	const now = new Date().toISOString();
	const seasons = await db.collection('seasons').get();
	const updates: { ref: DocumentReference; data: Record<string, unknown> }[] = [];

	for (const season of seasons.docs) {
		if (season.get('recapReadyAt')) continue;

		const { finished, players } = await readSeasonEnd(db, season.ref, now);
		if (!finished) continue;

		const profiles = players.length > 0 ? await db.getAll(...players.map(uid => db.doc(`users/${uid}`))) : [];
		const existing = profiles.filter(profile => profile.exists);

		console.log(`  ${season.id}: ${existing.length} of ${players.length} players marked as having watched it`);

		updates.push({ ref: season.ref, data: { recapReadyAt: now } });
		for (const profile of existing) {
			updates.push({ ref: profile.ref, data: { recapsWatched: FieldValue.arrayUnion(season.id) } });
		}
	}

	if (updates.length === 0) {
		console.log('Every finished season already has its recap stamp.');
		return;
	}

	if (dryRun) {
		console.log(`Dry run: would write ${updates.length} documents.`);
		return;
	}

	await applyUpdates(db, updates);
};

// Only when run as a command, so a test can import `main` and drive it
// against the emulators without `runScript` reaching for real credentials.
if (require.main === module) runScript(main);
