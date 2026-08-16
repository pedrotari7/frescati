/**
 * Fills in `seedElo` on every rating ledger entry that rated somebody unrated
 * before the field existed, from the result document the game was rated into.
 *
 * `before: null` records that a player carried no rating in, which is what makes
 * a rewind exact — but the game did not rate them off nothing. It seeded them at
 * the live average of the season's rated members and moved them from there, and
 * that number went unrecorded. So every screen aggregating the ledger had to
 * score a first appearance as no movement at all, and a newcomer sat on 0 in the
 * season table while the ten people they played with showed the same result as
 * ±4 — the two screens describing one evening differently.
 *
 * The result document is safe to read back for the same reason the team sheet
 * is: **it is what the game was rated into.** `TournamentResult.changes` holds
 * the `before` each player was actually rated off, seed included, written by the
 * same call that wrote this entry. This recomputes no rating and re-reads no
 * profile — it copies across a number the game already used, so nothing here
 * moves an Elo and no replay is needed.
 *
 * Entries where nobody was unrated are **left alone**: there was no seed to
 * record, and an absent field says so where a stored one would claim otherwise.
 *
 * A game whose result document is gone, or whose `changes` disagree with the
 * ledger about what the unrated were rated off, is **reported and skipped** —
 * the same bargain `backfill-ledger-teams` and `findStrandedKit` strike. A
 * plausible seed is unrecoverable once those two disagree, and writing a guess
 * would replace a visible gap with an invisible wrong answer that every later
 * replay would preserve.
 *
 * Safe to run repeatedly.
 *
 * Usage:
 *   pnpm --filter backend backfill-ledger-seed
 *   pnpm --filter backend backfill-ledger-seed --dry-run
 *
 * Against the local emulator instead of the real project:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pnpm --filter backend backfill-ledger-seed
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { RatingLedgerEntry, TournamentResult } from '../../shared/types';

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 500;

/**
 * Elo is a float, and a seed is an average — so the two copies have to agree to
 * within rounding rather than exactly.
 */
const TOLERANCE = 1e-6;

const resolveProjectId = (): string => {
	if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;

	const firebaserc = JSON.parse(readFileSync(join(__dirname, '..', '..', '.firebaserc'), 'utf8'));
	const projectId = firebaserc?.projects?.default;

	if (!projectId) throw new Error('No project id in .firebaserc and GOOGLE_CLOUD_PROJECT is unset.');

	return projectId;
};

/** Who this entry rated without a rating of their own. */
const unratedUids = (entry: RatingLedgerEntry): string[] =>
	Object.entries(entry.before ?? {})
		.filter(([, rating]) => rating === null)
		.map(([uid]) => uid);

const main = async () => {
	const dryRun = process.argv.includes('--dry-run');
	const projectId = resolveProjectId();
	const emulator = process.env.FIRESTORE_EMULATOR_HOST;

	process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId;
	initializeApp({ credential: applicationDefault(), projectId });

	const db = getFirestore();

	console.log(`${projectId}${emulator ? ` (emulator at ${emulator})` : ''}\n`);

	// The whole collection, which is one document per rated game — a group
	// playing weekly takes twenty years to make this a page worth splitting.
	const ledger = await db.collection('ratingLedger').get();

	const missing = ledger.docs.filter(doc => {
		const entry = doc.data() as RatingLedgerEntry;

		return entry.seedElo === undefined && unratedUids(entry).length > 0;
	});

	console.log(
		`${ledger.size} rated game${ledger.size === 1 ? '' : 's'}, ` +
			`${missing.length} rated somebody unrated with no seed recorded.`
	);

	if (missing.length === 0) {
		console.log('Nothing to do.');
		return;
	}

	const writes: { ref: FirebaseFirestore.DocumentReference; seedElo: number; label: string }[] = [];
	let skipped = 0;

	for (const doc of missing) {
		const entry = doc.data() as RatingLedgerEntry;
		const label = `${entry.kickoff.slice(0, 10)}  ratingLedger/${doc.id}`;
		const uids = unratedUids(entry);
		const result = await db.doc(`seasons/${entry.seasonId}/games/${entry.gameId}/tournament/result`).get();

		if (!result.exists) {
			skipped++;
			console.error(`  no result document, skipped — ${label}`);
			continue;
		}

		const rated = new Map((result.data() as TournamentResult).changes.map(change => [change.uid, change.before]));
		const seeds = uids.map(uid => rated.get(uid));

		if (seeds.some(seed => typeof seed !== 'number')) {
			skipped++;
			console.error(`  result document does not cover every unrated player, skipped — ${label}`);
			continue;
		}

		// Everybody unrated in one game seeds at the same average, so these are
		// copies of one number. Disagreeing means the result is no longer the one
		// this entry was computed from, and neither copy can be trusted as the
		// seed the ladder actually used.
		const [seedElo] = seeds as number[];

		if ((seeds as number[]).some(seed => Math.abs(seed - seedElo) > TOLERANCE)) {
			skipped++;
			console.error(`  result document disagrees with itself about the seed, skipped — ${label}`);
			continue;
		}

		writes.push({ ref: doc.ref, seedElo, label });
	}

	if (dryRun) {
		for (const write of writes.slice(0, 10)) {
			console.log(`  would write seedElo ${write.seedElo.toFixed(1)} — ${write.label}`);
		}
		if (writes.length > 10) console.log(`  ...and ${writes.length - 10} more`);
		console.log('\nDry run, nothing written.');
		return;
	}

	for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
		const batch = db.batch();

		for (const write of writes.slice(start, start + BATCH_LIMIT)) {
			batch.update(write.ref, { seedElo: write.seedElo });
		}

		await batch.commit();
		console.log(`  wrote ${Math.min(start + BATCH_LIMIT, writes.length)}/${writes.length}`);
	}

	const one = writes.length === 1;

	console.log(
		`\nDone. ${writes.length} entr${one ? 'y' : 'ies'} now ${one ? 'says' : 'say'} what the unrated started on` +
			`${skipped > 0 ? `, ${skipped} skipped` : ''}.`
	);
	if (skipped > 0) console.error(`${skipped} could not be filled in — see above.`);
};

main().catch((error: { message?: string }) => {
	if (error.message?.includes('Could not load the default credentials')) {
		console.error('No credentials. Run:  gcloud auth application-default login');
		process.exit(1);
	}

	console.error(error);
	process.exit(1);
});
