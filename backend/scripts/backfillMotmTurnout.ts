/**
 * Fills in `voterUids` on every man-of-the-match decision written before the
 * turnout was kept.
 *
 * `closeMotmVote` now copies who answered onto the decision as it publishes the
 * totals, so the panel can go on saying who voted and who didn't after the vote
 * shuts. A game decided before that shipped has the totals and no names, which
 * the panel draws as no turnout at all rather than as a lineup nobody in it
 * voted, so nothing is wrong on screen; there is simply nothing there. This is
 * the one-shot repair.
 *
 * The votes are what it reads back, and they are still under the game: counting
 * a vote does not consume it, and nobody can write one once the window is gone,
 * so this is a reconstruction from the original rather than from a copy.
 *
 * It refuses where the reconstruction and the record disagree. The published
 * totals sum to the number of votes cast, by construction, so a game where they
 * no longer do has had its votes changed since it was counted, and a turnout
 * that contradicts the tally printed beside it is worse than the blank it
 * replaces. Those are reported and skipped.
 *
 * Safe to run repeatedly: a decision that already carries a list is left alone,
 * and what it writes it derives from the votes, so the answer is the same every
 * time. Nothing here is a rating and nothing needs a replay: the winners, the
 * counts and the bonus they earned are all untouched.
 *
 * Usage:
 *   pnpm --filter backend backfill-motm-turnout
 *   pnpm --filter backend backfill-motm-turnout --dry-run
 *
 * Against the local emulator instead of the real project:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pnpm --filter backend backfill-motm-turnout
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import type { DocumentReference } from 'firebase-admin/firestore';
import type { TournamentMotm } from '../../shared/types';
import { counted } from '../../shared/format';
import { applyUpdates, runScript } from './lib/script';
import type { ScriptContext } from './lib/script';

export const main = async ({ db, dryRun }: ScriptContext) => {
	// Every `tournament/*` document in the app, narrowed here rather than in the
	// query: a collection group cannot be asked for a document id, and a game
	// holds four of these at most.
	const tournament = await db.collectionGroup('tournament').get();
	const decided = tournament.docs.filter(doc => doc.id === 'motm');
	const missing = decided.filter(doc => (doc.data() as TournamentMotm).voterUids === undefined);

	console.log(`${counted(decided.length, 'counted vote')}, ${missing.length} with no turnout recorded.`);

	if (missing.length === 0) {
		console.log('Nothing to do.');
		return;
	}

	const updates: { ref: DocumentReference; data: Record<string, unknown> }[] = [];
	let skipped = 0;

	for (const doc of missing) {
		// `tournament/motm` sits two levels under the game, so the game is the
		// parent of the parent. It is always there: the decision is deleted with
		// the game it belongs to.
		const game = doc.ref.parent.parent!;
		const votes = await game.collection('motmVotes').get();

		const { counts } = doc.data() as TournamentMotm;
		const published = counts.reduce((total, count) => total + count.votes, 0);

		if (votes.size !== published) {
			skipped++;
			console.error(
				`  skipped ${game.path}: ${counted(votes.size, 'vote')} stored against ${published} published. ` +
					'The votes have changed since this was counted, so who answered cannot be reconstructed.'
			);
			continue;
		}

		// The id is the voter, the same way `closeMotmVote` reads them: rules only
		// ever let somebody write their own. Sorted, so two runs and the sweep all
		// produce the same list.
		const voterUids = votes.docs.map(vote => vote.id).sort();

		if (dryRun) {
			console.log(`  would write ${counted(voterUids.length, 'voter')}: ${game.path}`);
			continue;
		}

		updates.push({ ref: doc.ref, data: { voterUids } });
	}

	if (dryRun) {
		console.log('\nDry run, nothing written.');
		return;
	}

	if (updates.length > 0) await applyUpdates(db, updates);

	console.log(`\nDone. Recorded the turnout for ${counted(updates.length, 'game')}.`);
	if (skipped > 0) console.error(`${skipped} skipped, see above.`);
};

// Only when run as a command, so a test can import `main` and drive it
// against the emulators without `runScript` reaching for real credentials.
if (require.main === module) runScript(main);
