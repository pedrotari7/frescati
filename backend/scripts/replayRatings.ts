/**
 * Rewinds and re-rates the whole ladder, in kickoff order, from the ledger.
 *
 * The one thing a rating change needs that nothing else can do. Every other
 * replay in the app starts from a game: a corrected scoreline, a counted vote, a
 * deleted game. Retuning `getRatingChanges` itself starts from *no* game — every
 * entry in the ledger was rated by the old code and none of them is wrong in a
 * way any trigger will ever notice. So this exists to say "from the beginning",
 * which is the only argument the replay machinery has no other caller for.
 *
 * **It changes almost nothing about how the replay runs.** `requestRatingReplay`
 * is the same door `finaliseTournament` and `closeMotmVoting` knock on, taking
 * the same ladder lock and draining the same pending floor — deliberately, and
 * not `replayRatingsFrom`, which that module says out loud is exported for its
 * tests. Between a rewind and the end of a replay the ladder is in a state
 * nobody should read or write, and a script is no more entitled to skip that
 * than a trigger is. What this passes is only where to start.
 *
 * Idempotent, and self-correcting rather than merely repeatable: the rewind runs
 * latest-first before anything is re-rated, so a second run produces the same
 * ladder as the first and an interrupted one is fixed by running it again.
 *
 * The window comes off the ledger and the football comes off the games. Every
 * entry records what each player carried in, which is what makes the rewind
 * exact; the re-rate then reads that game's team sheet and scorelines back, the
 * same ones a confirmation read. A game deleted since is rewound like any other
 * and then simply not replayed.
 *
 * **Deploy before running it.** This rates each game with the `getRatingChanges`
 * on the machine it runs from, not the one in production — so a replay done
 * first writes a ladder the deployed functions disagree with, and the next
 * confirmation or correction quietly re-rates its game the old way, unpicking
 * the new ladder a game at a time.
 *
 * **Nobody should be using the app while this runs.** The ladder lock keeps the
 * writes consistent; it does not stop a screen reading a half-rewound rating and
 * showing somebody a number that never existed. It is a few seconds of work for
 * a group with years of history — run it, then look at the table.
 *
 * `rate-replay-report` is how to see what it will do before doing it, and how to
 * check afterwards that it landed: once this has been, that report's "as rated"
 * column agrees with the K the code ships.
 *
 * Usage:
 *   pnpm --filter backend replay-ratings
 *   pnpm --filter backend replay-ratings --dry-run
 *   pnpm --filter backend replay-ratings 2026-01-01     # from a date, not the start
 *
 * Against the local emulator instead of the real project:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pnpm --filter backend replay-ratings
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import type { RatingLedgerEntry } from '../../shared/types';
import { counted } from '../../shared/format';
import { runScript, UsageError } from './lib/script';
import type { ScriptContext } from './lib/script';

/** The whole history, which is what a retuned formula needs. */
const FROM_THE_START = 0;

const parseFrom = (args: string[]): number => {
	if (args.length === 0) return FROM_THE_START;
	if (args.length > 1) throw new UsageError('One date at most, e.g.  replay-ratings 2026-01-01');

	const from = Date.parse(args[0]);

	if (Number.isNaN(from)) throw new UsageError(`Not a date: ${args[0]}. Try  replay-ratings 2026-01-01`);

	return from;
};

export const main = async ({ db, dryRun, args }: ScriptContext) => {
	const from = parseFrom(args);

	const entriesSnap = await db
		.collection('ratingLedger')
		.where('kickoffMillis', '>=', from)
		.orderBy('kickoffMillis', 'asc')
		.get();

	const entries = entriesSnap.docs.map(doc => doc.data() as RatingLedgerEntry);
	const scope = from === FROM_THE_START ? 'the whole ledger' : `from ${new Date(from).toISOString().slice(0, 10)}`;

	console.log(`${counted(entries.length, 'rated game')} to replay — ${scope}.`);

	if (entries.length === 0) {
		console.log('Nothing to do.');
		return;
	}

	const [first, last] = [entries[0], entries[entries.length - 1]];
	const players = new Set(entries.flatMap(entry => Object.keys(entry.before ?? {})));

	console.log(`  ${first.kickoff.slice(0, 10)} to ${last.kickoff.slice(0, 10)}`);
	console.log(`  ${counted(players.size, 'player')} whose rating this rewrites`);

	if (dryRun) {
		console.log('\nDry run, nothing written.');
		return;
	}

	// Imported here rather than at the top: the module reaches for a Firestore
	// handle as it loads, and `runScript` has only just initialised the app. The
	// seeder takes the same care for the same reason.
	const { requestRatingReplay } = await import('../src/lib/finalise');

	const replayed = await requestRatingReplay(from);

	// A count of this run's own work, which can come out *higher* than the games
	// listed above if a correction landed while it ran and it drained that too.
	// Zero is the one answer worth spelling out, because it is not a failure: the
	// floor is recorded either way, so a deferred request is still honoured.
	console.log(
		replayed === 0
			? '\nNothing re-rated here — either a ladder run was already in flight and has ' +
					'taken this on, or every game in the window has since been deleted.'
			: `\nDone. ${counted(replayed, 'game')} re-rated.`
	);
};

// Only when run as a command, so a test can import `main` and drive it
// against the emulators without `runScript` reaching for real credentials.
if (require.main === module) runScript(main);
