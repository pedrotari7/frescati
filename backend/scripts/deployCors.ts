/**
 * Puts `storage.cors.json` on the project's Cloud Storage bucket.
 *
 * Cloud Storage serves object bytes to a page on another origin only if the
 * bucket says so, and the app downloads a receipt with the reader's own
 * credentials rather than through a public download URL, on purpose. So the
 * bucket needs the app's origin written on it or `getBlob` fails in the
 * browser. See `docs/finances.md`.
 *
 * This exists because that was a manual step in the README, and manual steps do
 * not happen. The receipts feature shipped with the file written and never
 * applied, so uploading worked and every download failed as a CORS error that
 * says nothing about buckets. `pnpm deploy:rules` runs this now, and so does
 * CI, beside the rules it belongs with. The rules decide who may read a
 * receipt, and this decides whether the browser will hand the bytes to someone
 * they allowed.
 *
 * Usage:
 *   pnpm --filter backend deploy-cors
 *   pnpm --filter backend deploy-cors --dry-run
 *
 * Credentials are `runScript`'s: application-default from `gcloud`, or a
 * service account key in GOOGLE_APPLICATION_CREDENTIALS, which is what CI has.
 * It needs `storage.buckets.update`; both `roles/storage.admin` and
 * `roles/firebase.admin` carry it.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { getStorage } from 'firebase-admin/storage';
import { runScript } from './lib/script';
import type { ScriptContext } from './lib/script';

/**
 * One entry of a bucket CORS configuration, as Cloud Storage stores it.
 *
 * Declared here rather than imported as `Cors` from `@google-cloud/storage`,
 * where the type actually lives. That package is a transitive dependency of
 * `firebase-admin`, and pnpm will not resolve an undeclared import of it.
 * Adding it to `package.json` to borrow four optional fields is the worse
 * trade.
 */
interface CorsEntry {
	origin?: string[];
	method?: string[];
	responseHeader?: string[];
	maxAgeSeconds?: number;
}

/**
 * The bucket to write to.
 *
 * Derived from the project rather than configured, because a Firebase project
 * has exactly one default bucket and it is named after it. The override is for
 * the older `.appspot.com` spelling that earlier projects still use. Nothing
 * reads `frontend/.env.local`, which names the same bucket. It is gitignored,
 * so it is not there in CI.
 */
const bucketName = (projectId: string): string =>
	process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`;

/**
 * Whether the bucket already says what the file says.
 *
 * Compared as JSON, field order and all. Stricter than it needs to be, on
 * purpose. This runs on every deploy, and a looser check is one that calls two
 * orderings equal and stops writing the one the file asks for. Cloud Storage
 * hands the array back in the order it was given, so an unedited file matches
 * itself.
 */
const matches = (current: CorsEntry[] | undefined, wanted: CorsEntry[]): boolean =>
	JSON.stringify(current ?? []) === JSON.stringify(wanted);

const main = async ({ projectId, dryRun }: ScriptContext) => {
	const path = join(__dirname, '..', '..', 'storage.cors.json');
	const wanted = JSON.parse(readFileSync(path, 'utf8')) as CorsEntry[];

	if (!Array.isArray(wanted)) throw new Error(`${path} must hold an array of CORS entries.`);

	const bucket = getStorage().bucket(bucketName(projectId));
	const [metadata] = await bucket.getMetadata();

	const origins = wanted.flatMap(entry => entry.origin ?? []);

	if (matches(metadata.cors, wanted)) {
		console.log(`${bucket.name} already allows ${origins.join(', ')}. Nothing to do.`);
		return;
	}

	// Worth printing in full. The failure this guards against is a download
	// blocked from an origin nobody remembered to add, and the fix is always
	// visible in this list.
	console.log(`Allowing on ${bucket.name}:`);
	for (const origin of origins) console.log(`  ${origin}`);

	if (dryRun) {
		console.log('\n--dry-run, wrote nothing.');
		return;
	}

	await bucket.setCorsConfiguration(wanted);

	console.log('\nApplied. A browser holding a cached preflight can take up to an hour to notice.');
};

runScript(main);
