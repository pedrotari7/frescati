/**
 * Recomputes `counts` and `atRisk` on every game, repairing any response whose
 * `role` has drifted from its season's roster.
 *
 * `counts` is function-owned and only recomputed when somebody writes a
 * response, so any change to how the tally works — or any roster edit made
 * before the season trigger existed — leaves stored totals reading whatever
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

import { readFileSync } from 'fs';
import { join } from 'path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Season } from '../../shared/types';

const resolveProjectId = (): string => {
	if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;

	const firebaserc = JSON.parse(readFileSync(join(__dirname, '..', '..', '.firebaserc'), 'utf8'));
	const projectId = firebaserc?.projects?.default;

	if (!projectId) throw new Error('No project id in .firebaserc and GOOGLE_CLOUD_PROJECT is unset.');

	return projectId;
};

const main = async () => {
	const futureOnly = process.argv.includes('--future-only');
	const projectId = resolveProjectId();

	process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId;
	initializeApp({ credential: applicationDefault(), projectId });

	// Imported after initializeApp: the shared helper builds its Firestore handle
	// at module load, and there has to be an app for it to bind to.
	const { recountGame } = await import('../src/lib/recount');

	const db = getFirestore();
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
	if (failed > 0) console.error(`${failed} failed — see above.`);
};

main().catch((error: { message?: string }) => {
	if (error.message?.includes('Could not load the default credentials')) {
		console.error('No credentials. Run:  gcloud auth application-default login');
		process.exit(1);
	}

	console.error(error);
	process.exit(1);
});
