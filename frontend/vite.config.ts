import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { stylex } from './vite/stylexPlugin';

/**
 * The Vite build of this app, which exists beside `next.config.js` rather than
 * instead of it.
 *
 * Both configs compile the same `app/`, `components/`, `hooks/` and `lib/`.
 * What differs is everything a framework does around them, and `docs/build.md`
 * is the evaluation of whether that difference is worth taking. Keeping the two
 * buildable at once is the point: a comparison you can re-run is worth more
 * than one you have to believe, which is the same reason jest's configs stayed
 * in the tree through the vitest port.
 *
 * `vite/` holds what Next was providing and now has to be written down: the
 * routing, the document, and the two `next/*` modules the components import.
 */

/**
 * The repository a Vercel build was made from, as `owner/name`.
 *
 * Copied from `next.config.js`, which is the cost of the app running under two
 * builds. Both have to inline the same two values or `lib/build.ts` says a
 * different thing depending on which one made the bundle, and the whole point
 * of that module is answering "which build is this" out loud.
 */
const buildRepo = () => {
	const { VERCEL_GIT_PROVIDER: provider, VERCEL_GIT_REPO_OWNER: owner, VERCEL_GIT_REPO_SLUG: slug } = process.env;

	if (provider !== 'github' || !owner || !slug) return '';

	return `${owner}/${slug}`;
};

/** Every `NEXT_PUBLIC_` name the app reads, which is what `define` has to cover. */
const PUBLIC_ENV = [
	'NEXT_PUBLIC_FIREBASE_API_KEY',
	'NEXT_PUBLIC_FIREBASE_APP_ID',
	'NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN',
	'NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY',
	'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
	'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
	'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
	'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
	'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
	'NEXT_PUBLIC_FIREBASE_VAPID_KEY',
	'NEXT_PUBLIC_SENTRY_DSN',
	'NEXT_PUBLIC_USE_EMULATORS',
	'NEXT_PUBLIC_VERCEL_ENV',
];

export default defineConfig(({ mode }) => {
	/*
	 * Vite exposes prefixed variables on `import.meta.env`, and this app reads
	 * `process.env.NEXT_PUBLIC_*`, in 26 places across 15 names. Rewriting those
	 * reads would be a change to files the Next build also compiles, so the
	 * substitution happens here instead: `define` is a textual replacement, and
	 * a name absent from the environment becomes `''` rather than a crash on a
	 * `process` that does not exist in a browser.
	 */
	const env = { ...loadEnv(mode, __dirname, 'NEXT_PUBLIC_'), ...process.env };

	const define: Record<string, string> = {
		'process.env.NEXT_PUBLIC_BUILD_SHA': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? ''),
		'process.env.NEXT_PUBLIC_BUILD_REPO': JSON.stringify(buildRepo()),
	};

	for (const name of PUBLIC_ENV) define[`process.env.${name}`] = JSON.stringify(env[name] ?? '');

	/*
	 * Nothing in the app reads this, but `lib/sentry.ts` and React both do,
	 * through dependencies that branch on it. Vite would otherwise leave the
	 * expression alone and the browser would throw on `process`.
	 */
	define['process.env.NODE_ENV'] = JSON.stringify(mode === 'development' ? 'development' : 'production');

	return {
		plugins: [stylex(), react()],
		define,
		resolve: {
			alias: [
				/*
				 * The two Next modules the components import, answered by the
				 * router instead. `vite/adapters` says what each one owes its
				 * callers. Aliasing rather than rewriting 21 files keeps `app/`
				 * compiling under both builds, which is what makes the comparison
				 * re-runnable.
				 */
				{ find: /^next\/link$/, replacement: path.resolve(__dirname, 'vite/adapters/link.tsx') },
				{
					find: /^next\/navigation$/,
					replacement: path.resolve(__dirname, 'vite/adapters/navigation.ts'),
				},
				/*
				 * `@sentry/nextjs` is `@sentry/react` plus the parts that wrap a
				 * server this build does not have. `lib/sentry.ts` imports it
				 * lazily and by type, and uses only the browser surface.
				 */
				{ find: /^@sentry\/nextjs$/, replacement: '@sentry/react' },
				{ find: '@shared', replacement: path.resolve(__dirname, '../shared') },
				{ find: '@', replacement: __dirname },
			],
		},
		// `frontend/vite/postcss.config.cjs` rather than the one beside this file:
		// it is the same options with the port's own directory added, and keeping
		// them apart is what stops the Next build's stylesheet growing rules for
		// components only this build renders.
		css: { postcss: path.resolve(__dirname, 'vite') },
		build: {
			/*
			 * The list in `/.browserslistrc`, which is Next's own modern target
			 * written down. Vite defaults to something else, so without this the
			 * two builds compile for different browsers and every byte compared
			 * between them is measuring that instead. Opera 51 is Chrome 64.
			 */
			target: ['chrome64', 'edge79', 'firefox67', 'safari12'],
			// Next ships none: `next.config.js` uploads them to Sentry and deletes
			// them, so shipping them here would put a de-minified copy of the app
			// on the CDN and make every size below incomparable.
			sourcemap: false,
			emptyOutDir: true,
			/*
			 * Written so `scripts/bench-build.mjs` can work out what a visitor
			 * actually downloads for a given route: the entry chunk, everything it
			 * statically imports, and the lazy chunk for the screen. Next prints
			 * that number as "First Load JS" and there is no way to compare the two
			 * builds without computing the same thing here. It is a JSON file in
			 * `dist/.vite/`, not a shipped asset.
			 */
			manifest: true,
		},
	};
});
