import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Backend tests exercise the real Cloud Functions against a live Firestore +
 * Auth emulator, so they run separately from the pure `shared/` suites:
 * `pnpm test:backend`. Serialised: every test clears the whole emulator
 * database in `beforeEach`, which would race a sibling file running in a
 * second worker against the same instance.
 *
 * `setup.ts` has to land before the test file's own imports pull in
 * `firebase-functions/logger`, which snapshots the console the moment it is
 * first required. Vitest runs `setupFiles` ahead of the test module, which is
 * the guarantee jest's `setupFiles` was giving; `setupAfterEnv.ts` only
 * registers a `beforeEach`, so it can sit in the same list.
 */
export default defineConfig({
	test: {
		environment: 'node',
		root: path.resolve(__dirname, '..'),
		include: ['backend/tests/**/*.test.ts'],
		globals: true,
		setupFiles: ['./backend/tests/setup.ts', './backend/tests/setupAfterEnv.ts'],
		testTimeout: 20000,
		hookTimeout: 20000,
		fileParallelism: false,
		coverage: { enabled: false },
	},
});
