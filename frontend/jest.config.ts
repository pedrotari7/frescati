import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
	testEnvironment: 'jest-environment-jsdom',
	setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
	maxWorkers: 4,
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/$1',
		'^@shared/(.*)$': '<rootDir>/../shared/$1',
	},
	collectCoverage: true,
	/**
	 * The unit-testable half of the frontend. `app/` is left out deliberately
	 * rather than counted and ignored: a route is a Firestore subscription, a
	 * layout and a permission check assembled together, and what it is worth
	 * asserting about one is that it renders the real thing against real rules,
	 * which is an end-to-end test, not a jsdom render with eight mocked modules.
	 * Counting it here would only pull the figure below anything worth gating on.
	 */
	collectCoverageFrom: ['{components,hooks,lib}/**/*.{ts,tsx}', '!**/*.test.{ts,tsx}'],
	coverageReporters: ['text-summary', 'lcov'],
	/**
	 * Set just below where this actually sits today, so it ratchets rather than
	 * aspires, the same reasoning as the `shared/` thresholds, and the reason
	 * this suite collected no coverage at all before: an uncounted figure can
	 * only ever fall silently.
	 */
	coverageThreshold: {
		global: {
			statements: 64,
			branches: 70,
			functions: 58,
			lines: 67,
		},
	},
};

export default createJestConfig(config);
