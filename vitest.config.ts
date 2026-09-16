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
			 * Istanbul rather than v8, which this config used to pick for being
			 * the one that needs no extra package and instruments nothing. What
			 * changed is that something else reads this output: `fallow health`
			 * scores every function by CRAP, complexity weighted by how well
			 * tested it is, and it reads coverage in Istanbul's format only.
			 * Given v8 output it estimated the coverage half from the module
			 * graph instead, and estimated it badly enough that 70 of 101
			 * complexity findings breached CRAP and nothing else, on a repo
			 * sitting at 99% statements. `docs/fallow.md` has the numbers.
			 *
			 * So the cost is real and it is paid deliberately: one more dev
			 * dependency, and a slower run, because Istanbul instruments the
			 * source rather than reading what the engine already recorded. What
			 * it buys is a threshold that can fail for a true reason.
			 *
			 * The two count slightly differently, which is why the thresholds
			 * below moved with the provider rather than after it.
			 */
			provider: 'istanbul',
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
			 * Branches sits at 94 rather than the 95 it carried under v8, and the
			 * tests did not get worse: Istanbul counts a branch differently and
			 * reads the same suite as 94.06 where v8 read 95.18. The other three
			 * moved by hundredths and stayed put. This is the whole of what the
			 * provider change cost, and it is the reason the number moves in the
			 * same commit rather than after it, so no run is ever green against
			 * a threshold nobody re-derived.
			 */
			thresholds: {
				statements: 99,
				branches: 94,
				functions: 98,
				lines: 99,
			},
		},
	},
});
