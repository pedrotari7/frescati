import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
	testEnvironment: 'jest-environment-jsdom',
	setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
	maxWorkers: 4,
	/**
	 * Compile the tests the way the app is compiled.
	 *
	 * `next/jest` hands everything to SWC, and SWC cannot run StyleX: its only
	 * compiler is a Babel plugin. Left alone, every suite that renders a
	 * component died on `Unexpected 'stylex.defineVars' call at runtime`, which
	 * is the runtime shim saying it was never compiled. The key here is the one
	 * `next/jest` uses, so this replaces the SWC transformer rather than being
	 * added alongside it, and `babel.config.js` is the same file the build uses.
	 */
	transform: {
		'^.+\\.(js|jsx|ts|tsx|mjs)$': ['babel-jest', { configFile: './babel.config.js' }],
	},
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/$1',
		'^@shared/(.*)$': '<rootDir>/../shared/$1',
	},
	collectCoverage: true,
	/**
	 * Count coverage off V8 rather than by instrumenting the source.
	 *
	 * The default provider is `babel-plugin-istanbul`, which jest appends to the
	 * plugin list, and it does not compose with StyleX: an instrumented
	 * `stylex.keyframes` call comes out of Babel uncompiled and throws at import,
	 * and an instrumented arrow function inside `stylex.create`, the one dynamic
	 * style in the app, fails the build outright with `Unsupported expression:
	 * ArrowFunctionExpression`. V8 counts the code that actually ran and maps it
	 * back through Babel's source maps, so nothing has to be rewritten to be
	 * measured.
	 */
	coverageProvider: 'v8',
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
	 *
	 * The numbers moved when the provider did, and upwards, which is a difference
	 * in counting rather than in testing. Istanbul counts the statements it can
	 * see in the source; V8 counts byte ranges of what the engine ran, so a file
	 * imported and never called still has its top level counted, and a JSX tree
	 * is one range rather than one per prop. Branches read higher for the same
	 * reason and functions slightly lower, since every arrow in an untouched
	 * module is its own uncalled function.
	 */
	coverageThreshold: {
		global: {
			statements: 78,
			branches: 89,
			functions: 61,
			lines: 78,
		},
	},
};

export default createJestConfig(config);
