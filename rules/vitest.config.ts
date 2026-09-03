import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Rules tests need a live Firestore emulator, so they run separately from the
 * pure `shared/` suites: `pnpm test:rules`.
 *
 * `clientWrites.test.ts` also drives the frontend's own `lib/db` through these
 * rules, which is why `@shared/*` has to resolve here, that code is written for
 * the Next.js bundler and imports shared types by alias.
 *
 * Serialised, like the backend suite and for the same reason: both emulator
 * files clear the whole database in `beforeEach`, so a sibling running in a
 * second worker against the same instance deletes its fixtures mid-test.
 */
export default defineConfig({
	resolve: {
		alias: { '@shared': path.resolve(__dirname, '../shared') },
	},
	test: {
		environment: 'node',
		root: path.resolve(__dirname, '..'),
		include: ['rules/**/*.test.ts'],
		globals: true,
		setupFiles: ['./vitest.setup.ts'],
		testTimeout: 20000,
		hookTimeout: 20000,
		fileParallelism: false,
		coverage: { enabled: false },
	},
});
