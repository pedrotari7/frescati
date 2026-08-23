/**
 * Recomputes `counts` and `atRisk` on every game, repairing any response whose
 * `role` has drifted from its season's roster.
 *
 * `counts` is function-owned and only recomputed when somebody writes a
 * response, so any change to how the tally works, or any roster edit made
 * before the season trigger existed, leaves stored totals reading whatever
 * they read at the time. This is the one-shot repair for that.
 *
 * Worth running after:
 *   - changing how confirmation or the tally works
 *   - any roster edit made before `onSeasonWrite` was deployed
 *
 * Safe to run repeatedly: it writes the same answer every time.
 *
 * Usage:
 *   pnpm --filter backend recount-games
 *   pnpm --filter backend recount-games --future-only
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import type { Season } from '../../shared/types';
import { runScript } from './lib/script';
import type { ScriptContext } from './lib/script';

export const main = async ({ db }: ScriptContext) => {
	const futureOnly = process.argv.includes('--future-only');

	// Imported after initializeApp: the shared helper builds its Firestore handle
	// at module load, and there has to be an app for it to bind to.
	const { recountGame } = await import('../src/lib/recount');

	const seasonsSnap = await db.collection('seasons').get();

	let games = 0;
	let failed = 0;

	for (const seasonDoc of seasonsSnap.docs) {
		const season = { ...seasonDoc.data(), id: seasonDoc.id } as Season;

		let query = seasonDoc.ref.collection('games').orderBy('kickoff');
		if (futureOnly) query = query.where('kickoff', '>=', new Date().toISOString());

		const gamesSnap = await query.get();

		for (const gameDoc of gamesSnap.docs) {
			try {
				const result = await recountGame(gameDoc.ref, season, { repairRoles: true });
				if (result) games++;
			} catch (error) {
				failed++;
				console.error(`  failed ${gameDoc.ref.path}:`, error);
			}
		}

		console.log(`${season.name}: ${gamesSnap.size} games`);
	}

	console.log(`\nRecounted ${games} games across ${seasonsSnap.size} seasons.`);
	if (failed > 0) console.error(`${failed} failed. See above.`);
};

// Only when run as a command, so a test can import `main` and drive it
// against the emulators without `runScript` reaching for real credentials.
if (require.main === module) runScript(main);
