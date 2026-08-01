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
	collectCoverage: false,
};

export default createJestConfig(config);
