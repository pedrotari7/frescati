/**
 * Turns the late entry fees raised as `entry` into `late`, across every season.
 *
 * The late join sheet first shipped writing its charge as an `entry`, which
 * counts towards the bill. A late joiner's money is on top of the bill and
 * belongs in the extras' pot, which is what `late` says. The rules let an admin
 * change a charge's status, amount and note but never its kind, so a charge
 * already written can only be moved from here.
 *
 * A charge is picked out by its note, the one the sheet writes with
 * `lateEntryNote`. The sheet is the only thing that writes a note on an entry
 * fee, and the pattern is held to that function's output in
 * `tests/backfills.test.ts`, so a change to the wording fails a test instead of
 * leaving this matching nothing. Only `kind` is written. The amount, the note
 * and whether it has been paid all stay as they are, and `onDueWrite` finds the
 * debt unchanged and skips it. Safe to run twice: a charge already `late` is
 * never read.
 *
 * Usage:
 *   pnpm --filter backend backfill-late-entries --dry-run
 *   pnpm --filter backend backfill-late-entries
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import type { DocumentReference } from 'firebase-admin/firestore';
import type { Due } from '../../shared/types';
import { applyUpdates, runScript } from './lib/script';
import type { ScriptContext } from './lib/script';

/** `Joined Tue 13 Oct, 8 of 20 games`, as `lateEntryNote` writes it. */
export const LATE_ENTRY_NOTE = /^Joined \w{3} \d{1,2} \w{3}, \d+ of \d+ games?$/;

export const main = async ({ db, dryRun }: ScriptContext) => {
	const seasons = await db.collection('seasons').get();
	const updates: { ref: DocumentReference; data: Record<string, unknown> }[] = [];

	for (const season of seasons.docs) {
		const entries = await season.ref.collection('dues').where('kind', '==', 'entry').get();

		for (const doc of entries.docs) {
			const due = doc.data() as Due;

			if (!due.note || !LATE_ENTRY_NOTE.test(due.note)) continue;

			console.log(
				`  ${season.data().name ?? season.id}: ${due.uid}, ${due.amount} kr, ${due.status} (${due.note})`
			);
			updates.push({ ref: doc.ref, data: { kind: 'late' } });
		}
	}

	console.log(`\n${dryRun ? 'Would move' : 'Moving'} ${updates.length} charge(s) to the extras' pot.`);

	if (dryRun) {
		console.log('Dry run, nothing written.');
		return;
	}

	await applyUpdates(db, updates, 'moved');
};

// Only when run as a command, so a test can import `main` and drive it against
// the emulators without `runScript` reaching for real credentials.
if (require.main === module) runScript(main);
