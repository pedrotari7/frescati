import type { Config } from 'jest';

const customJestConfig: Config = {
	testEnvironment: 'node',
	roots: ['<rootDir>/shared/'],
	transform: {
		'^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'node' } }],
	},
	setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
	collectCoverage: true,
	collectCoverageFrom: ['<rootDir>/shared/**/*.ts'],
	coveragePathIgnorePatterns: ['.*__snapshots__/.*'],
	coverageReporters: ['json', 'lcov', 'text', 'clover'],
	coverageDirectory: '<rootDir>/coverage',
	/**
	 * Set just under where `shared/` actually sits, not at some aspirational
	 * floor. At 70/60 the gap to the real numbers was thirty points, which meant
	 * a third of these tests could be deleted with CI still green, a threshold
	 * that cannot fail is documentation, not a check. Raise it when the real
	 * figure rises; the point is that it only ever moves deliberately.
	 */
	coverageThreshold: {
		global: {
			statements: 99,
			branches: 90,
			functions: 98,
			lines: 99,
		},
	},
};

export default customJestConfig;
