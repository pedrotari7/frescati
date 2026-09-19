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

import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { Due } from '../../shared/types';
import { runScript } from './lib/script';
import type { ScriptContext } from './lib/script';
import type { DebtorMarkChange, markWhatIsOwed } from '../src/onDueWrite';

/** What the run touched, by what it did. `unchanged` is counted separately. */
type Tally = Record<Exclude<DebtorMarkChange, 'unchanged'>, number>;

const emptyTally = (): Tally => ({ created: 0, updated: 0, cleared: 0 });

/**
 * One season's marks, recomputed.
 *
 * Split out of `main` rather than nested inside it because the loop over a
 * season's uids is the only reason this script branched deeply enough to breach
 * the cognitive ceiling. Up here it starts at the top of a function, and `main`
 * is left doing what it says: every season, then the totals.
 */
const backfillSeason = async (
	seasonDoc: QueryDocumentSnapshot,
	markOwed: typeof markWhatIsOwed,
	dryRun: boolean
): Promise<{ checked: number; changed: Tally }> => {
	const duesSnap = await seasonDoc.ref.collection('dues').get();
	const seasonUids = [...new Set(duesSnap.docs.map(doc => (doc.data() as Due).uid))];

	const changed = emptyTally();
	let touched = 0;

	for (const uid of seasonUids) {
		const result = await markOwed(seasonDoc.id, uid, { dryRun });
		if (result.change === 'unchanged') continue;

		touched++;
		changed[result.change]++;

		const verb = dryRun ? `would be ${result.change}` : result.change;
		console.log(`  ${seasonDoc.id}/${uid}: ${verb} (${result.outstanding} across ${result.charges} charges)`);
	}

	if (touched > 0) console.log(`${seasonDoc.data().name ?? seasonDoc.id}: ${touched} mark(s) touched`);

	return { checked: seasonUids.length, changed };
};

export const main = async ({ db, dryRun }: ScriptContext) => {
	// Imported after initializeApp: the shared helper builds its Firestore handle
	// at module load, and there has to be an app for it to bind to. The type of
	// the same export is imported at the top, which erases and reaches nothing.
	const { markWhatIsOwed: markOwed } = await import('../src/onDueWrite');

	const seasonsSnap = await db.collection('seasons').get();

	const changed = emptyTally();
	let uids = 0;

	for (const seasonDoc of seasonsSnap.docs) {
		const season = await backfillSeason(seasonDoc, markOwed, dryRun);

		uids += season.checked;
		changed.created += season.changed.created;
		changed.updated += season.changed.updated;
		changed.cleared += season.changed.cleared;
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
