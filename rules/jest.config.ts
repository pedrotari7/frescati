import type { Config } from 'jest';

/**
 * Rules tests need a live Firestore emulator, so they run separately from the
 * pure `shared/` suites: `pnpm test:rules`.
 */
const config: Config = {
	testEnvironment: 'node',
	rootDir: '..',
	roots: ['<rootDir>/rules/'],
	transform: {
		'^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'node' } }],
	},
	setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
	testTimeout: 20000,
	collectCoverage: false,
};

export default config;
