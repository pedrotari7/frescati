/**
 * Fills in `teams` on every rating ledger entry written before the field
 * existed, from the team sheet the game was rated against.
 *
 * `positions` records where each player's team *finished*, shared on a tie, so
 * it cannot say who somebody actually played alongside: two players level on 0
 * may have been side by side or on the two teams that drew, and in a two-team
 * game that ends level the whole lineup looks like one team. Anything about who
 * plays with whom needs the team map, and `getPlayerLinks` skips an entry that
 * has none rather than guessing, so without this, a career screen counts a
 * player's whole back catalogue in its record and none of it in its teammates.
 *
 * The team sheet is safe to read back years later for exactly the reason a
 * replay can: **a confirmed game's lineup is never rebuilt.** `rebuildTeams`
 * refuses on a game with a result, precisely so the document the ledger was
 * computed against is still the document sitting there. This derives nothing
 * and invents nothing. It copies across a map the game already agreed on.
 *
 * A game whose team sheet is gone, or whose sheet names a different set of
 * players than its ledger entry rated, is **reported and skipped**. The same
 * bargain `findStrandedKit` strikes: the app does not know what that game's
 * teams were, and writing a plausible guess would replace a visible gap with an
 * invisible wrong answer that every later replay would preserve.
 *
 * Safe to run repeatedly, and nothing here is a rating. The map records what
 * the teams *were*, not what the game did to anybody, so no replay is needed
 * and none of these writes moves an Elo.
 *
 * Usage:
 *   pnpm --filter backend backfill-ledger-teams
 *   pnpm --filter backend backfill-ledger-teams --dry-run
 *
 * Against the local emulator instead of the real project:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pnpm --filter backend backfill-ledger-teams
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import type { RatingLedgerEntry, TournamentTeams } from '../../shared/types';
import { counted, plural } from '../../shared/format';
import { applyUpdates, runScript } from './lib/script';
import type { ScriptContext } from './lib/script';

const sameSquad = (a: string[], b: string[]): boolean => {
	const sortedA = [...a].sort();
	const sortedB = [...b].sort();

	return sortedA.length === sortedB.length && sortedA.every((uid, index) => uid === sortedB[index]);
};

export const main = async ({ db, dryRun }: ScriptContext) => {
	// The whole collection, which is one document per rated game. A group
	// playing weekly takes twenty years to make this a page worth splitting.
	const ledger = await db.collection('ratingLedger').get();
	const missing = ledger.docs.filter(doc => !(doc.data() as RatingLedgerEntry).teams);

	console.log(`${counted(ledger.size, 'rated game')}, ${missing.length} with no team map.`);

	if (missing.length === 0) {
		console.log('Nothing to do.');
		return;
	}

	const writes: { ref: FirebaseFirestore.DocumentReference; teams: Record<string, number>; label: string }[] = [];
	let skipped = 0;

	for (const doc of missing) {
		const entry = doc.data() as RatingLedgerEntry;
		const label = `${entry.kickoff.slice(0, 10)}  ratingLedger/${doc.id}`;
		const sheet = await db.doc(`seasons/${entry.seasonId}/games/${entry.gameId}/tournament/teams`).get();

		if (!sheet.exists) {
			skipped++;
			console.error(`  no team sheet, skipped: ${label}`);
			continue;
		}

		const teams = Object.fromEntries(
			(sheet.data() as TournamentTeams).teams.flatMap(team => team.uids.map(uid => [uid, team.index]))
		) as Record<string, number>;

		// The two have to describe the same game. They will, unless a lineup was
		// somehow rewritten after the ratings were applied, in which case the
		// sheet is no longer what this entry was computed against, and copying it
		// across would record teams nobody played on.
		if (!sameSquad(Object.keys(teams), Object.keys(entry.positions ?? {}))) {
			skipped++;
			console.error(`  team sheet disagrees with the ledger, skipped: ${label}`);
			continue;
		}

		writes.push({ ref: doc.ref, teams, label });
	}

	if (dryRun) {
		for (const write of writes.slice(0, 10)) {
			console.log(`  would write ${Object.keys(write.teams).length} players: ${write.label}`);
		}
		if (writes.length > 10) console.log(`  ...and ${writes.length - 10} more`);
		console.log('\nDry run, nothing written.');
		return;
	}

	await applyUpdates(
		db,
		writes.map(write => ({ ref: write.ref, data: { teams: write.teams } }))
	);

	console.log(
		`\nDone. ${counted(writes.length, 'entry', 'entries')} now ${plural(writes.length, 'says', 'say')} who played with whom` +
			`${skipped > 0 ? `, ${skipped} skipped` : ''}.`
	);
	if (skipped > 0) console.error(`${skipped} could not be filled in, see above.`);
};

// Only when run as a command, so a test can import `main` and drive it
// against the emulators without `runScript` reaching for real credentials.
if (require.main === module) runScript(main);
