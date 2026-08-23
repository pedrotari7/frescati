/**
 * Runs before any test file is required, so `lib/firebase`'s `initializeApp()`,
 * and every `getFirestore()`/`getAuth()` call downstream of it, picks up
 * the emulators instead of reaching for production.
 */
process.env.GCLOUD_PROJECT = 'demo-frescati';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-frescati' });
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

/**
 * `firebase-functions/logger` snapshots `console.debug/info/log/warn` into a
 * private `UNPATCHED_CONSOLE` the moment it's first required, deliberately,
 * so nothing can intercept its writes afterwards. Every backend function
 * logs through `logger.info`/`.warn`/`.debug`, never through `console`
 * directly, so this has to run in `setupFiles` (before the test file's own
 * imports pull that module in) rather than a `beforeEach` in
 * `setupFilesAfterEnv`. By then the snapshot has already captured the real
 * methods.
 *
 * A plain assignment, not `jest.spyOn`: several test files call
 * `jest.restoreAllMocks()` in their own `afterEach` for their own spies, and
 * that would revert a spied console method too, which `UNPATCHED_CONSOLE`
 * would keep calling through to for the rest of the file, reopening the
 * leak. `restoreAllMocks`/`resetAllMocks` don't touch a mock that was never
 * created via `spyOn`, so this stays a no-op for the whole run.
 * `console.error` is left alone: `logger.error` only fires on a
 * caught-exception path, and seeing that during a test run is more likely
 * useful than noisy.
 */
for (const method of ['debug', 'info', 'log', 'warn'] as const) {
	console[method] = jest.fn();
}
