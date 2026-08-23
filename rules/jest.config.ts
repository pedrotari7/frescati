import type { Config } from 'jest';

/**
 * Rules tests need a live Firestore emulator, so they run separately from the
 * pure `shared/` suites: `pnpm test:rules`.
 *
 * `clientWrites.test.ts` also drives the frontend's own `lib/db` through these
 * rules, which is why `@shared/*` has to resolve here, that code is written for
 * the Next.js bundler and imports shared types by alias.
 */
const config: Config = {
	testEnvironment: 'node',
	rootDir: '..',
	roots: ['<rootDir>/rules/'],
	transform: {
		'^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'node' } }],
	},
	moduleNameMapper: {
		'^@shared/(.*)$': '<rootDir>/shared/$1',
	},
	setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
	testTimeout: 20000,
	/**
	 * Serialised, like the backend suite and for the same reason: both emulator
	 * files clear the whole database in `beforeEach`, so a sibling running in a
	 * second worker against the same instance deletes its fixtures mid-test. It
	 * did not matter while this suite was one file; it does now.
	 */
	maxWorkers: 1,
	collectCoverage: false,
};

export default config;
