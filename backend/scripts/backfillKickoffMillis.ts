/**
 * Reconciles `kickoffMillis` with `kickoff` across the whole calendar — filling
 * it in where it is missing, and correcting it where the two have drifted apart.
 *
 * Security rules enforce the response deadline against this number, because they
 * have no way to parse the ISO 8601 `kickoff`. Games missing it fall back to a
 * far-future default in the rules — answerable forever, exactly as they were
 * before — so this is what turns the deadline on for an existing calendar.
 *
 * The correcting half matters as much as the backfilling one, and for a sharper
 * reason: a game whose mirror is *wrong* rather than absent has its deadline
 * enforced against the wrong instant, silently. `onGameWrite` now repairs that
 * as it happens, so this is the sweep for anything that drifted before it did,
 * or while it was failing.
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

import { applyUpdates, runScript } from './lib/script';
import type { ScriptContext } from './lib/script';

export const main = async ({ db, dryRun }: ScriptContext) => {
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

	await applyUpdates(
		db,
		stale.map(doc => ({
			ref: doc.ref,
			data: { kickoffMillis: Date.parse((doc.data() as { kickoff: string }).kickoff) },
		}))
	);

	console.log('\nDone. The response deadline is now enforced for every game.');
};

// Only when run as a command, so a test can import `main` and drive it
// against the emulators without `runScript` reaching for real credentials.
if (require.main === module) runScript(main);
