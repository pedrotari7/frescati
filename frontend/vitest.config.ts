import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { stylex } from './test/stylexPlugin';

/**
 * The frontend suite: jsdom, the real components, and StyleX compiled the way
 * the build compiles it. `test/stylexPlugin.ts` says why that is a Babel pass
 * of its own rather than an option on the React plugin.
 *
 * What `next/jest` did for this suite it barely had to: nothing under test
 * imports CSS, `next/font` or `next/image`, and `next/navigation` is mocked
 * everywhere it appears. What is left is the two aliases below, which are the
 * ones `tsconfig.json` already declares.
 */
export default defineConfig({
	plugins: [stylex(), react()],
	resolve: {
		alias: {
			'@shared': path.resolve(__dirname, '../shared'),
			'@': path.resolve(__dirname),
		},
	},
	test: {
		environment: 'jsdom',
		globals: true,
		include: ['{components,hooks,lib}/**/*.test.{ts,tsx}'],
		setupFiles: ['./vitest.setup.ts'],
		/**
		 * Worker threads rather than the default child processes, which is worth
		 * about nine seconds here: a jsdom is built per file either way, and a
		 * thread is a much cheaper thing to start one in. The two faster options
		 * are both off the table. `isolate: false` shares one environment across
		 * files and fails 169 tests, so this suite's independence is real rather
		 * than incidental, and `pool: 'vmThreads'` crashes a worker outright.
		 */
		pool: 'threads',
		coverage: {
			enabled: true,
			provider: 'v8',
			include: ['{components,hooks,lib}/**/*.{ts,tsx}'],
			exclude: ['**/*.test.{ts,tsx}'],
			reporter: ['text-summary', 'lcov'],
			/**
			 * Set just below where this actually sits today, so it ratchets rather
			 * than aspires, the same reasoning as the `shared/` thresholds.
			 *
			 * The numbers fell about ten points when the runner changed, and no
			 * test was lost on the way: 654 passed before and 654 pass now. Both
			 * runners counted with V8, but jest measured the file Babel had
			 * already compiled, all 13,406 statements of it, where the source
			 * holds 2,106. The extra 11,300 are the JSX factory calls, the
			 * interop shims and the helpers a transpiler writes, and generated
			 * code of that sort is nearly all executed, so it dragged every
			 * percentage up towards itself. Vitest maps the same V8 ranges back
			 * to the TypeScript that was written before counting them.
			 *
			 * So this is the first honest reading of this suite, and it is the
			 * lower one. Raising it is a matter of writing tests, not of
			 * changing what gets counted.
			 */
			thresholds: {
				statements: 69,
				branches: 70,
				functions: 61,
				lines: 70,
			},
		},
	},
});
