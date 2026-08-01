import type { Config } from 'jest';

const customJestConfig: Config = {
	testEnvironment: 'node',
	roots: ['<rootDir>/shared/'],
	transform: {
		'^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'node' } }],
	},
	collectCoverage: true,
	collectCoverageFrom: ['<rootDir>/shared/**/*.ts'],
	coveragePathIgnorePatterns: ['.*__snapshots__/.*'],
	coverageReporters: ['json', 'lcov', 'text', 'clover'],
	coverageDirectory: '<rootDir>/coverage',
	coverageThreshold: {
		global: {
			statements: 70,
			branches: 60,
			functions: 70,
			lines: 70,
		},
	},
};

export default customJestConfig;
