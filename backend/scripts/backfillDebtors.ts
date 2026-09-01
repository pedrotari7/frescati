/**
 * Recomputes `seasons/{id}/debtors/{uid}` from the `dues` underneath it,
 * across every season.
 *
 * `onDueWrite` keeps that mark in step, but only for a charge written after the
 * trigger existed. A charge raised before its first deploy, or written while it
 * was failing, has nothing to redeliver the event: no later write touches that
 * same document, so nothing ever nudges the trigger to look at it again. The
 * mark just stays missing, silently, in exactly the shape `recountGames.ts`
 * repairs for `counts` and `atRisk`.
 *
 * Runs the trigger's own `markWhatIsOwed` over every uid with a due in each
 * season, rather than a second copy of that logic. Safe to run repeatedly: a
 * uid whose mark already matches its charges is left alone.
 *
 * Worth running after:
 *   - `onDueWrite`'s first deploy to a project with existing seasons
 *   - any period the function was failing or undeployed
 *
 * Usage:
 *   pnpm --filter backend backfill-debtors
 *   pnpm --filter backend backfill-debtors --dry-run
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import type { Due } from '../../shared/types';
import { runScript } from './lib/script';
import type { ScriptContext } from './lib/script';
import type { DebtorMarkChange } from '../src/onDueWrite';

export const main = async ({ db, dryRun }: ScriptContext) => {
	// Imported after initializeApp: the shared helper builds its Firestore handle
	// at module load, and there has to be an app for it to bind to.
	const { markWhatIsOwed } = await import('../src/onDueWrite');

	const seasonsSnap = await db.collection('seasons').get();

	const changed: Record<Exclude<DebtorMarkChange, 'unchanged'>, number> = { created: 0, updated: 0, cleared: 0 };
	let uids = 0;

	for (const seasonDoc of seasonsSnap.docs) {
		const duesSnap = await seasonDoc.ref.collection('dues').get();
		const seasonUids = [...new Set(duesSnap.docs.map(doc => (doc.data() as Due).uid))];

		if (seasonUids.length === 0) continue;

		let seasonChanges = 0;

		for (const uid of seasonUids) {
			const result = await markWhatIsOwed(seasonDoc.id, uid, { dryRun });

			uids++;
			if (result.change === 'unchanged') continue;

			seasonChanges++;
			changed[result.change]++;

			const verb = dryRun ? `would be ${result.change}` : result.change;
			console.log(`  ${seasonDoc.id}/${uid}: ${verb} (${result.outstanding} across ${result.charges} charges)`);
		}

		if (seasonChanges > 0) console.log(`${seasonDoc.data().name ?? seasonDoc.id}: ${seasonChanges} mark(s) touched`);
	}

	const total = changed.created + changed.updated + changed.cleared;

	console.log(
		`\n${dryRun ? 'Would touch' : 'Touched'} ${total} mark(s) across ${uids} uid(s) checked: ` +
			`${changed.created} created, ${changed.updated} updated, ${changed.cleared} cleared.`
	);
	if (dryRun) console.log('Dry run, nothing written.');
};

// Only when run as a command, so a test can import `main` and drive it against
// the emulators without `runScript` reaching for real credentials.
if (require.main === module) runScript(main);
