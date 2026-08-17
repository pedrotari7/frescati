/**
 * Writes `tournament/motmVoters` for every game whose man-of-the-match vote is
 * open, from the votes already stored under it.
 *
 * `onMotmVoteWrite` derives that document, so a game whose votes all arrived
 * before the trigger was deployed has none — and the panel reads a missing
 * document as "nobody has voted yet", which is exactly the wrong answer for a
 * game the squad has already been voting on. It would fix itself the moment
 * anybody else voted, and never if they didn't. This is the one-shot repair.
 *
 * Scoped to open votes, which is the whole set that can need one: a vote that
 * has been counted publishes its turnout in `tournament/motm` and has this
 * document deleted with the window, so writing one there would be resurrecting
 * something the sweep deliberately removed. `recountMotmVoters` refuses to
 * anyway — the decision is what says the counting has happened — but the query
 * means it is never asked to.
 *
 * Safe to run repeatedly: a game whose stored turnout already matches its votes
 * is left alone, and anything it does write it derives from the votes, so the
 * answer is the same every time. Nothing here is a rating, so nothing needs a
 * replay.
 *
 * Usage:
 *   pnpm --filter backend backfill-motm-voters
 *   pnpm --filter backend backfill-motm-voters --dry-run
 *
 * Against the local emulator instead of the real project:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pnpm --filter backend backfill-motm-voters
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import { counted } from '../../shared/format';
import { runScript } from './lib/script';
import type { ScriptContext } from './lib/script';

const main = async ({ db, dryRun }: ScriptContext) => {
	// Imported after initializeApp: the shared helper builds its Firestore handle
	// at module load, and there has to be an app for it to bind to.
	const { recountMotmVoters } = await import('../src/lib/motm');

	// The same single-field query `closeMotmVoting` runs, and for the same reason:
	// the window is on a game only while its vote is open, so this asks for the
	// handful currently voting however long the back catalogue gets.
	const open = await db.collectionGroup('games').where('motmVotingUntilMillis', '>', 0).get();

	console.log(`${counted(open.size, 'game')} with a vote open.`);

	if (open.empty) return;

	let written = 0;
	let skipped = 0;
	let failed = 0;

	for (const doc of open.docs) {
		const { seasonId, kickoff } = doc.data() as { seasonId: string; kickoff: string };
		const label = `${kickoff.slice(0, 10)}  ${doc.ref.path}`;

		// What the turnout *should* say, against what it does. Compared here rather
		// than left to `recountMotmVoters` so a dry run can tell a game that needs
		// writing from one that is already right — a preview that reports the same
		// line either way cannot answer the question anybody runs it to ask, which
		// is whether this has already been done.
		const [votes, stored] = await Promise.all([
			doc.ref.collection('motmVotes').get(),
			doc.ref.collection('tournament').doc('motmVoters').get(),
		]);

		const should = votes.docs.map(vote => vote.id).sort();
		const has = stored.exists ? ((stored.data() as { uids?: string[] }).uids ?? []) : [];

		// An absent document and an empty list are the same state — nobody has
		// voted — so a game with no votes and no document needs nothing doing.
		if (has.length === should.length && has.every((uid, index) => uid === should[index])) {
			skipped++;
			console.log(`  already correct (${should.length}) — ${label}`);
			continue;
		}

		const change = `${has.length} -> ${counted(should.length, 'voter')}`;

		if (dryRun) {
			console.log(`  would write ${change} — ${label}`);
			continue;
		}

		try {
			const voted = await recountMotmVoters(seasonId, doc.id);
			written++;
			console.log(`  wrote ${has.length} -> ${counted(voted, 'voter')} — ${label}`);
		} catch (error) {
			failed++;
			console.error(`  failed ${doc.ref.path}:`, error);
		}
	}

	if (dryRun) {
		console.log('\nDry run, nothing written.');
		return;
	}

	console.log(
		`\nDone. Rebuilt the turnout for ${counted(written, 'game')}` +
			`${skipped > 0 ? `, ${skipped} already correct` : ''}.`
	);
	if (failed > 0) console.error(`${failed} failed — see above.`);
};

runScript(main);
