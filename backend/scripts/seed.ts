/**
 * Fill the local emulators with a database worth looking at.
 *
 * The app reads and writes Firestore directly, so "mocking the backend" here
 * means running the real one locally and giving it a past: thirty players, a
 * few seasons, a season's worth of confirmed results and a fixture list that
 * covers every state a game screen can be in. Nothing is stubbed. The rules
 * are the deployed rules and the triggers are the deployed triggers, so a
 * screen that works against a seed works against production.
 *
 * Usage:
 *   pnpm emulators                      # in one terminal, and leave it running
 *   pnpm seed                           # in another
 *   pnpm seed --scenario=big
 *   pnpm seed --list
 *   pnpm seed --origin=http://localhost:3001   # if the app isn't on 3000
 *
 * Safe by construction: this points the Admin SDK at the emulator hosts itself
 * and refuses to start if nothing is listening on them, so there is no
 * combination of flags or stray credentials that can reach the real project.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { initializeApp } from 'firebase-admin/app';
import { CAST, avatarPath, avatarSvg } from './seed/cast';
import { DEFAULT_SCENARIO, SCENARIOS } from './seed/scenarios';
import { seedScenario, settle, wipeEmulators } from './seed/write';

const ROOT = join(__dirname, '..', '..');
const PUBLIC = join(ROOT, 'frontend', 'public');

/** Where the switcher in the app looks for the seeded accounts. */
const DEV_USERS_FILE = join(PUBLIC, 'dev-users.json');

/** Both are gitignored. A seed is a local fixture, not a checked-in one. */
const AVATAR_DIR = join(PUBLIC, 'dev-avatars');

/**
 * Avatars are files under `frontend/public` because Firebase Auth will not
 * accept a `data:` URI as a `photoURL`, and the app copies the auth record onto
 * the profile on every sign-in. Written fresh each run so a rename in the cast
 * can't leave a stale face behind.
 */
const writeAvatars = () => {
	rmSync(AVATAR_DIR, { recursive: true, force: true });
	mkdirSync(AVATAR_DIR, { recursive: true });

	for (const member of CAST) {
		const path = avatarPath(member);
		if (path) writeFileSync(join(PUBLIC, path), avatarSvg(member));
	}
};

interface EmulatorPorts {
	firestore: number;
	auth: number;
	functions: number;
}

const readConfig = (): { projectId: string; ports: EmulatorPorts } => {
	const firebaserc = JSON.parse(readFileSync(join(ROOT, '.firebaserc'), 'utf8'));
	const firebaseJson = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf8'));

	const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? firebaserc?.projects?.default;
	if (!projectId) throw new Error('No project id in .firebaserc and GOOGLE_CLOUD_PROJECT is unset.');

	return {
		// Has to match `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, or the app connects to
		// a different, and empty, database inside the same emulator.
		projectId,
		ports: {
			firestore: firebaseJson?.emulators?.firestore?.port ?? 8080,
			auth: firebaseJson?.emulators?.auth?.port ?? 9099,
			functions: firebaseJson?.emulators?.functions?.port ?? 5001,
		},
	};
};

const reachable = async (host: string): Promise<boolean> => {
	try {
		await fetch(`http://${host}/`, { signal: AbortSignal.timeout(2000) });

		return true;
	} catch {
		return false;
	}
};

const argument = (name: string): string | undefined =>
	process.argv
		.slice(2)
		.find(value => value.startsWith(`--${name}=`))
		?.split('=')[1];

const main = async () => {
	if (process.argv.includes('--list')) {
		for (const [name, scenario] of Object.entries(SCENARIOS)) {
			console.log(`${name.padEnd(8)} ${scenario.summary}`);
		}

		return;
	}

	const name = argument('scenario') ?? DEFAULT_SCENARIO;
	const scenario = SCENARIOS[name];

	if (!scenario) {
		console.error(`No scenario called "${name}". Try: ${Object.keys(SCENARIOS).join(', ')}`);
		process.exit(1);
	}

	const { projectId, ports } = readConfig();

	// Set before `initializeApp`, and never read from the caller's environment:
	// the Admin SDK talks to whatever these say, so owning them here is what
	// makes it impossible for this script to write to the real project.
	process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${ports.firestore}`;
	process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${ports.auth}`;

	const missing = (
		await Promise.all(
			[process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_AUTH_EMULATOR_HOST].map(async host => ({
				host,
				up: await reachable(host),
			}))
		)
	).filter(check => !check.up);

	if (missing.length > 0) {
		console.error(`Nothing listening on ${missing.map(check => check.host).join(' or ')}.`);
		console.error('Start the emulators first:  pnpm emulators');
		process.exit(1);
	}

	initializeApp({ projectId });

	console.log(`Seeding "${name}" into the ${projectId} emulators: ${scenario.summary}.`);

	// Whether anything will be writing back while we work, which is what the
	// run id and the settle step at the end both exist to cope with.
	const withFunctions = await reachable(`127.0.0.1:${ports.functions}`);

	if (withFunctions) console.log('  Functions emulator is up, pacing around its triggers.');

	if (!process.argv.includes('--keep')) await wipeEmulators(projectId);

	writeAvatars();

	// Short and time-ordered. Anything unique per run would do; this at least
	// sorts, so a `--keep` database reads in the order it was seeded.
	const runId = Date.now().toString(36).slice(-5);

	const summary = await seedScenario(scenario, argument('origin') ?? 'http://localhost:3000', runId);

	await settle(summary.seasonIds, summary.lineups, summary.finalisedAt, withFunctions);

	writeFileSync(
		DEV_USERS_FILE,
		`${JSON.stringify({ scenario: name, generatedAt: new Date().toISOString(), users: summary.devUsers }, null, '\t')}\n`
	);

	console.log(
		[
			`  ${summary.seasons} seasons, ${summary.games} games, ${summary.responses} responses`,
			`  ${summary.confirmedGames} confirmed games, ${summary.ratedPlayers} rated players, ${summary.kit} pieces of kit`,
			`  ${summary.dues} charges, ${summary.expenses} expenses`,
			`  ${summary.devUsers.length} accounts written to frontend/public/dev-users.json`,
		].join('\n')
	);
	console.log('\nSet NEXT_PUBLIC_USE_EMULATORS=1 in frontend/.env.local, then pick a player from the dev switcher.');
};

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
