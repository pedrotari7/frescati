import type { DocumentReference } from 'firebase-admin/firestore';
import type { RatingLedgerEntry } from '../../../shared/types';
import { counted, plural } from '../../../shared/format';
import { applyUpdates } from './script';
import type { ScriptContext } from './script';

/**
 * What one entry works out to: the value to write, or the reason it cannot be
 * worked out.
 *
 * A skip is a string rather than a thrown error because it is an expected
 * outcome, not a failure. Both backfills strike the same bargain: a game whose
 * sibling document is gone, or disagrees with the ledger about who played, is
 * reported and left alone. Writing a plausible guess would replace a visible
 * gap with an invisible wrong answer that every later replay would preserve.
 */
export type Derived<T> = { value: T } | { skip: string };

/**
 * The shape both ledger backfills are: read the collection, find the entries
 * missing a field, work each one out from the document the game was rated
 * against, and write what survives.
 *
 * `backfill-ledger-seed` and `backfill-ledger-teams` were this algorithm twice,
 * differing in which field they fill and which sibling document they read. The
 * halves that matter, the skip bargain and the dry run that prints a plan
 * rather than writing one, were copied rather than shared, which is two places
 * to get a backfill against the real project wrong.
 *
 * Any backfill that recomputes a rating belongs nowhere near this. Both of
 * these copy across a number the game already used, which is why neither needs
 * a replay, and a third that does not hold to that is a different script.
 */
export const backfillLedger = async <T>(
	{ db, dryRun }: ScriptContext,
	{
		field,
		needs,
		found,
		derive,
		describe,
		wrote,
	}: {
		/** The entry field being filled in. */
		field: string;
		/** Whether this entry still wants one. */
		needs: (entry: RatingLedgerEntry) => boolean;
		/** What to call the entries that do, for the opening count. */
		found: (missing: number) => string;
		/** The value for one entry, or why there isn't one. */
		derive: (entry: RatingLedgerEntry) => Promise<Derived<T>>;
		/** What a dry run says it would write. */
		describe: (value: T) => string;
		/** What an entry now says, for the closing line. */
		wrote: string;
	}
): Promise<void> => {
	// The whole collection, which is one document per rated game. A group
	// playing weekly takes twenty years to make this a page worth splitting.
	const ledger = await db.collection('ratingLedger').get();
	const missing = ledger.docs.filter(doc => needs(doc.data() as RatingLedgerEntry));

	console.log(`${counted(ledger.size, 'rated game')}, ${found(missing.length)}`);

	if (missing.length === 0) {
		console.log('Nothing to do.');
		return;
	}

	const writes: { ref: DocumentReference; value: T; label: string }[] = [];
	let skipped = 0;

	for (const doc of missing) {
		const entry = doc.data() as RatingLedgerEntry;
		const label = `${entry.kickoff.slice(0, 10)}  ratingLedger/${doc.id}`;
		const derived = await derive(entry);

		if ('skip' in derived) {
			skipped++;
			console.error(`  ${derived.skip}, skipped: ${label}`);
			continue;
		}

		writes.push({ ref: doc.ref, value: derived.value, label });
	}

	if (dryRun) {
		for (const write of writes.slice(0, 10)) console.log(`  would write ${describe(write.value)}: ${write.label}`);
		if (writes.length > 10) console.log(`  ...and ${writes.length - 10} more`);
		console.log('\nDry run, nothing written.');
		return;
	}

	await applyUpdates(
		db,
		writes.map(write => ({ ref: write.ref, data: { [field]: write.value } }))
	);

	console.log(
		`\nDone. ${counted(writes.length, 'entry', 'entries')} now ${plural(writes.length, 'says', 'say')} ${wrote}` +
			`${skipped > 0 ? `, ${skipped} skipped` : ''}.`
	);
	if (skipped > 0) console.error(`${skipped} could not be filled in, see above.`);
};
