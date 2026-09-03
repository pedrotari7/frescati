import { defineConfig } from 'vitest/config';

/**
 * The pure `shared/` suites: no DOM, no emulator, no compiler worth the name.
 * `pnpm test` runs this and nothing else, which is the same thing it meant
 * before, and green here still says nothing about the frontend, the rules or
 * the functions.
 */
export default defineConfig({
	test: {
		environment: 'node',
		include: ['shared/**/*.test.ts'],
		globals: true,
		setupFiles: ['./vitest.setup.ts'],
		coverage: {
			enabled: true,
			/**
			 * V8 rather than the istanbul provider jest defaulted to here. It
			 * needs no extra package and instruments nothing; what it costs is
			 * that the two count slightly differently, so a file or two reads a
			 * point off where it used to. Nothing here is close enough to a
			 * threshold for that to matter, and the frontend config has the long
			 * version of what changes between the two.
			 */
			provider: 'v8',
			include: ['shared/**/*.ts'],
			exclude: ['shared/**/*.test.ts', '**/__snapshots__/**'],
			reporter: ['json', 'lcov', 'text', 'clover'],
			reportsDirectory: './coverage',
			/**
			 * Set just under where `shared/` actually sits, not at some aspirational
			 * floor. At 70/60 the gap to the real numbers was thirty points, which
			 * meant a third of these tests could be deleted with CI still green, a
			 * threshold that cannot fail is documentation, not a check. Raise it
			 * when the real figure rises; the point is that it only ever moves
			 * deliberately.
			 *
			 * Branches sits at 95 rather than the 90 it carried under jest for
			 * exactly that reason: the real figure is 95.13, and five points of
			 * slack is five points nobody would notice losing.
			 */
			thresholds: {
				statements: 99,
				branches: 95,
				functions: 98,
				lines: 99,
			},
		},
	},
});
