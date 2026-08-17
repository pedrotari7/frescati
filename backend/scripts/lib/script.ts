import { readFileSync } from 'fs';
import { join } from 'path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { BATCH_LIMIT, chunksOf } from '../../src/lib/batch';

/**
 * The forty lines every one-shot script opened with.
 *
 * Resolving the project, initialising the app, parsing `--dry-run`, saying
 * which database is about to be touched, and turning a missing credential into
 * the one sentence that fixes it — none of that is what any of these scripts is
 * about, and all of it was copied into nine of them. `resolveProjectId` was
 * byte-identical in all nine; `whoami` had its own weaker version that read
 * `.firebaserc` unguarded, which is exactly the drift this prevents.
 *
 * Importing `src/lib/batch` is safe from here because that module imports only
 * types — nothing in it reaches for a Firestore handle at load, so no app is
 * needed before `runScript` has made one.
 */

export interface ScriptContext {
	db: Firestore;
	projectId: string;
	/** `--dry-run` was passed: work out the plan, print it, write nothing. */
	dryRun: boolean;
	/** Positional arguments, with every `--flag` removed. */
	args: string[];
}

/**
 * A script called wrongly, rather than one that failed.
 *
 * Printed as its message alone with no stack, because a usage line followed by
 * a JavaScript trace reads as a crash in the tool rather than a typo in the
 * command.
 */
export class UsageError extends Error {}

/**
 * Application-default credentials from `gcloud` carry no project, unlike a
 * service account key — so read it from the same place the CLI does.
 */
const resolveProjectId = (): string => {
	if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;

	const firebaserc = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '.firebaserc'), 'utf8'));
	const projectId = firebaserc?.projects?.default;

	if (!projectId) throw new Error('No project id in .firebaserc and GOOGLE_CLOUD_PROJECT is unset.');

	return projectId;
};

/**
 * The failures worth a sentence instead of a stack trace. Everything else is a
 * genuine bug and gets the full object.
 */
const explain = (error: { code?: string; message?: string }): string | null => {
	if (error instanceof UsageError) return error.message;

	// Both scripts that look somebody up by email can produce this, and neither
	// can do anything about it. Worded for both: `set-admin` used to say "before
	// you can promote them" and `whoami`, which only reads, said nothing at all.
	if (error.code === 'auth/user-not-found') {
		return 'No such user. They need to sign into the app at least once first.';
	}

	if (error.message?.includes('Could not load the default credentials')) {
		return 'No credentials. Run:  gcloud auth application-default login';
	}

	return null;
};

/**
 * Run a script body against an initialised app.
 *
 * The banner goes out before the body rather than after, deliberately: these
 * scripts delete accounts and rewrite ledgers, and "which database am I
 * pointed at" is a question worth answering before the writing starts rather
 * than in the summary line afterwards.
 */
export const runScript = (main: (context: ScriptContext) => Promise<void>): void => {
	const run = async () => {
		const projectId = resolveProjectId();

		// User-based ADC (from `gcloud auth application-default login`) carries no
		// quota project, and the Identity Toolkit API refuses to serve without one.
		// Service account keys don't need this, but setting it is harmless there.
		process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId;

		initializeApp({ credential: applicationDefault(), projectId });

		const emulator = process.env.FIRESTORE_EMULATOR_HOST;
		console.log(`${projectId}${emulator ? ` (emulator at ${emulator})` : ''}\n`);

		await main({
			db: getFirestore(),
			projectId,
			dryRun: process.argv.includes('--dry-run'),
			args: process.argv.slice(2).filter(argument => !argument.startsWith('--')),
		});
	};

	run().catch((error: { code?: string; message?: string }) => {
		const sentence = explain(error);

		console.error(sentence ?? error);
		process.exit(1);
	});
};

/**
 * Apply a pile of single-document updates, reporting progress as it goes.
 *
 * The progress line is the point — these run against the real project over a
 * home connection, and a backfill that prints nothing for ninety seconds is
 * indistinguishable from one that has hung.
 *
 * `BATCH_LIMIT` is 400 rather than the 500 four of these scripts each declared
 * for themselves. Both are under Firestore's cap; sharing one number is worth
 * more than the occasional extra round trip.
 */
export const applyUpdates = async (
	db: Firestore,
	updates: { ref: DocumentReference; data: Record<string, unknown> }[],
	verb = 'wrote'
): Promise<void> => {
	let done = 0;

	for (const chunk of chunksOf(updates, BATCH_LIMIT)) {
		const batch = db.batch();

		for (const { ref, data } of chunk) batch.update(ref, data);

		await batch.commit();

		done += chunk.length;
		console.log(`  ${verb} ${done}/${updates.length}`);
	}
};
