#!/usr/bin/env node
/*
 * Writes the deploy configuration the Vite build needs into
 * `frontend/vercel.json`, and checks it rather than writing it when asked to.
 *
 *   pnpm --filter frontend headers          write it
 *   pnpm --filter frontend headers:check    fail if what is committed is stale
 *
 * Three things go in, and only the first is interesting.
 *
 * `headers` is generated because the policy behind it is computed. See
 * `vite/headers.mjs` for what that costs.
 *
 * `rewrites` is what a client-routed app needs from any static host: every
 * path that is not a file and not a function has to be answered with
 * `index.html`, because the router runs in the browser and there is nothing on
 * the server that knows what `/s/abc/g/def` is. Next needed no such line, since
 * it had a server that knew the route table.
 *
 * `cleanUrls` is off deliberately. It would redirect `/seasons/` to `/seasons`
 * and vice versa, and the app builds its own hrefs.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHeaders } from './headers.mjs';

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(frontend, 'vercel.json');

const existing = JSON.parse(readFileSync(target, 'utf8'));

const config = {
	...existing,
	headers: buildHeaders(),
	rewrites: [
		/*
		 * Everything that is not an asset or a function. The negative lookahead
		 * spells out what has to stay reachable: the functions in `frontend/api`,
		 * the hashed bundles, and the handful of files served from `public` by
		 * name that a person or a browser asks for directly. A rewrite that
		 * swallowed `/sw.js` would serve the app's HTML as the service worker.
		 */
		{
			source: '/((?!api/|assets/|sw\\.js|manifest\\.json|offline\\.html|robots\\.txt|.*\\.(?:png|svg|ico|json|webmanifest)).*)',
			destination: '/index.html',
		},
	],
};

// Tabs and a trailing newline, because prettier owns this file too.
const rendered = `${JSON.stringify(config, null, '\t')}\n`;

if (process.argv.includes('--check')) {
	if (readFileSync(target, 'utf8') === rendered) {
		console.log('frontend/vercel.json is what the generator produces.');
		process.exit(0);
	}

	console.error(
		'frontend/vercel.json is stale. Run `pnpm --filter frontend headers` and commit the result.\n' +
			'The headers there are generated from `frontend/vite/headers.mjs`, which is where to make the change.'
	);
	process.exit(1);
}

writeFileSync(target, rendered);
console.log(`Wrote ${config.headers.length} header rules and ${config.rewrites.length} rewrite to frontend/vercel.json.`);
