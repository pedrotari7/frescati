/*
 * The response headers, and the one place the port is plainly worse.
 *
 * `next.config.js` computes these in JavaScript, on every build, from
 * `NODE_ENV` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. A hundred lines of it are
 * comments explaining which host is in the policy and why, and the two computed
 * parts are load-bearing: a dev server needs `'unsafe-eval'` and the emulator
 * ports, and the callable functions live at a host built out of the project id,
 * so a fork with a different project gets a different `connect-src`.
 *
 * `vercel.json` is static JSON and can express none of that. So this generates
 * it: `pnpm --filter frontend headers` writes the `headers` block into
 * `frontend/vercel.json`, and the check in CI runs the same generator and fails
 * if what it produces is not what is committed.
 *
 * That is a worse arrangement than a config file that is simply evaluated, and
 * it is worth being honest about rather than hiding: a generated file can be
 * edited by hand, can be committed stale, and needs a CI job to say so. What it
 * buys is that the policy stays one derivation from one set of facts, rather
 * than a copy in JSON that drifts from the reasoning next door.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where the browser posts violations. See `frontend/api/csp-report.ts`. */
const CSP_REPORT_PATH = '/api/csp-report';

/**
 * The deployed policy only.
 *
 * `next.config.js` also has a dev branch, for a `next dev` that evals every
 * module and talks to emulators on ports of their own. There is nothing to
 * generate for that here: `vite dev` serves its own headers and a Vercel deploy
 * is the only thing that reads this file, so the dev additions have nowhere to
 * go and, more to the point, no way to leak into a deploy.
 */
const functionsRegion = 'europe-west1';

/**
 * The project the callable functions answer for.
 *
 * Read from `.firebaserc` rather than from the environment, which is the one
 * real difference from how `next.config.js` gets it. That config runs during a
 * build and can read `NEXT_PUBLIC_FIREBASE_PROJECT_ID`; this runs when somebody
 * regenerates the file, and a generated artefact that depends on whatever was
 * exported in that shell is one that cannot be checked in CI. `.firebaserc` is
 * committed, is the same fact, and is what `firebase deploy` already believes.
 *
 * The environment still wins when it is set, so a fork deploying to a second
 * project can generate for it without editing `.firebaserc`.
 */
const projectFromFirebaserc = () => {
	try {
		const path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.firebaserc');
		return JSON.parse(readFileSync(path, 'utf8')).projects?.default ?? '';
	} catch {
		return '';
	}
};

export const buildHeaders = (projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || projectFromFirebaserc()) => {
	// A build with no project id has no working Firebase config either, so it
	// gets no entry rather than a malformed one.
	const functionsSrc = projectId ? [`https://${functionsRegion}-${projectId}.cloudfunctions.net`] : [];

	const scriptSrc = [
		"'self'",
		// The bundler inlines nothing to speak of, but Vercel Analytics and the
		// Firebase auth helper both do, and this matches what ships today.
		"'unsafe-inline'",
		'https://apis.google.com',
		'https://www.gstatic.com',
		'https://www.google.com',
	];

	const connectSrc = [
		"'self'",
		'https://*.googleapis.com',
		'https://*.google.com',
		'https://*.firebaseio.com',
		'wss://*.firebaseio.com',
		'https://*.gstatic.com',
		...functionsSrc,
	];

	const reportOnlyCsp = [
		"default-src 'self'",
		`script-src ${scriptSrc.join(' ')}`,
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob: https://*.googleusercontent.com https://*.google.com",
		"font-src 'self' data:",
		`connect-src ${connectSrc.join(' ')}`,
		"frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.google.com",
		"worker-src 'self'",
		"manifest-src 'self'",
		"base-uri 'self'",
		"form-action 'self'",
		"object-src 'none'",
		`report-uri ${CSP_REPORT_PATH}`,
		'report-to csp-endpoint',
	].join('; ');

	return [
		{
			source: '/:path*',
			headers: [
				{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
				{ key: 'Content-Security-Policy-Report-Only', value: reportOnlyCsp },
				{ key: 'Reporting-Endpoints', value: `csp-endpoint="${CSP_REPORT_PATH}"` },
				{ key: 'X-Frame-Options', value: 'DENY' },
				{ key: 'X-Content-Type-Options', value: 'nosniff' },
				{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
				{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
				{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
			],
		},
		{
			// Without this the browser caches the worker and never picks up a new
			// one, which strands people on a stale build.
			source: '/sw.js',
			headers: [
				{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
				{ key: 'Service-Worker-Allowed', value: '/' },
			],
		},
	];
};
