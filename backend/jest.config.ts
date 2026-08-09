import type { Config } from 'jest';

/**
 * Backend tests exercise the real Cloud Functions against a live Firestore +
 * Auth emulator, so they run separately from the pure `shared/` suites:
 * `pnpm test:backend`. Serialised — every test clears the whole emulator
 * database in `beforeEach`, which would race a sibling file running in a
 * second worker against the same instance.
 */
const config: Config = {
	testEnvironment: 'node',
	rootDir: '..',
	roots: ['<rootDir>/backend/tests/'],
	transform: {
		'^.+\\.tsx?$': [
			'ts-jest',
			{ tsconfig: { module: 'commonjs', moduleResolution: 'node', esModuleInterop: true } },
		],
	},
	setupFiles: ['<rootDir>/backend/tests/setup.ts'],
	setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
	testTimeout: 20000,
	maxWorkers: 1,
	collectCoverage: false,
};

export default config;
