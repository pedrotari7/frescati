const path = require('path');
const { withSentryConfig } = require('@sentry/nextjs');

/** Where the browser posts violations. See `app/api/csp-report/route.ts`. */
const CSP_REPORT_PATH = '/api/csp-report';

/*
 * Content Security Policy, shipped in report-only mode.
 *
 * The app talks to a lot of Google hosts: Firestore over gRPC-web, the
 * identity toolkit, FCM registration, reCAPTCHA for App Check, avatars on
 * googleusercontent, and Next inlines both its hydration script and its
 * critical CSS. A policy written blind and enforced immediately breaks sign-in
 * or the live listeners in production, which is the one place it can't be
 * debugged safely.
 *
 * So this reports rather than blocks. Violations now go somewhere: without a
 * `report-uri` they landed only in the console of whoever happened to have
 * devtools open on the live site, which meant the "watch it for a few days"
 * step could never actually produce evidence, and the switch to enforcing
 * could only ever be made blind.
 *
 * What this is worth here is worth being honest about. There is no
 * `dangerouslySetInnerHTML` anywhere in the app, every user-supplied string
 * goes through a React text node, so the injected-script surface is close to
 * zero, and the real authorization boundary is Firestore rules. This is
 * defence in depth against a compromised dependency, and `script-src
 * 'unsafe-inline'` blunts most of that, since an injected inline script would
 * still run. Removing it needs a nonce, which needs middleware, which would
 * deopt every statically rendered page. That trade hasn't been taken.
 *
 * `frame-ancestors` is the exception, it is ignored in report-only mode, so it
 * ships enforcing in its own header below, alongside X-Frame-Options. That is
 * the clickjacking protection, and it can't break a same-origin app.
 */
/**
 * Whether this is `next dev`. `headers()` is evaluated once: at build time for
 * a deploy, at server start for a dev run, so this decides which policy gets
 * baked in, and the dev additions below can never reach a deployed one.
 */
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Sources only the dev server needs.
 *
 * `next dev` is a materially different app from the one that ships: webpack
 * hands every module to `eval` and React Refresh evals its patches, Vercel
 * Analytics loads a debug build from `va.vercel-scripts.com` instead of the
 * same-origin `/_vercel/insights/script.js` a deploy serves, and the Firestore,
 * auth and functions emulators each listen on a port of their own, which
 * `'self'` does not cover, since a port is part of an origin.
 *
 * Report-only means none of that broke anything. What it broke was the reports:
 * a single local page load buried the console under ~1000 `unsafe-eval`
 * violations, and a policy whose output nobody reads is one nobody will ever
 * dare enforce. The alternative, widening the shipped policy until dev is
 * quiet, pays for that silence in the one place the policy is worth anything.
 */
const devScriptSrc = ["'unsafe-eval'", 'https://va.vercel-scripts.com'];
const devConnectSrc = ['http://127.0.0.1:*', 'http://localhost:*', 'ws://127.0.0.1:*', 'ws://localhost:*'];

/**
 * Where the callable functions answer.
 *
 * Nothing else here covers them. A callable is posted to
 * `<region>-<project>.cloudfunctions.net`, which is neither same-origin nor
 * `googleapis.com`, so the browser reported a violation for every one the ten
 * in `lib/db` make: chasing a debtor, granting the admin claim, handing out a
 * calendar link. The day this policy enforces it would refuse them instead.
 *
 * The exact host rather than `*.cloudfunctions.net`, which would name every
 * project on Google Cloud as somewhere this app may post to. That costs one
 * more copy of the region, which has to match `FUNCTIONS_REGION` in
 * `lib/firebaseClient.ts`, which already has to match `REGION` in the backend.
 * A build with no project id has no working Firebase config either, so it gets
 * no entry rather than a malformed one.
 */
const functionsRegion = 'europe-west1';
const functionsProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const functionsSrc = functionsProject ? [`https://${functionsRegion}-${functionsProject}.cloudfunctions.net`] : [];

const scriptSrc = [
	"'self'",
	// Next inlines the hydration payload; there's no nonce plumbed through.
	"'unsafe-inline'",
	// `www.google.com` serves reCAPTCHA Enterprise, which App Check loads.
	'https://apis.google.com',
	'https://www.gstatic.com',
	'https://www.google.com',
	...(isDev ? devScriptSrc : []),
];

const connectSrc = [
	"'self'",
	// Firestore listeners, auth, FCM registration and App Check attestation,
	// the last of those on firebaseappcheck.googleapis.com.
	'https://*.googleapis.com',
	'https://*.google.com',
	'https://*.firebaseio.com',
	'wss://*.firebaseio.com',
	'https://*.gstatic.com',
	...functionsSrc,
	...(isDev ? devConnectSrc : []),
];

const reportOnlyCsp = [
	"default-src 'self'",
	`script-src ${scriptSrc.join(' ')}`,
	// Tailwind and Next both inject style tags.
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https://*.googleusercontent.com https://*.google.com",
	"font-src 'self' data:",
	`connect-src ${connectSrc.join(' ')}`,
	// The auth helper iframe, and reCAPTCHA's.
	"frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.google.com",
	"worker-src 'self'",
	"manifest-src 'self'",
	"base-uri 'self'",
	"form-action 'self'",
	"object-src 'none'",
	// Both spellings on purpose: `report-uri` is deprecated but is what most
	// browsers still act on, and `report-to` is the replacement that needs the
	// `Reporting-Endpoints` header below. They deliver different payload shapes,
	// which is why the handler logs the body rather than parsing it.
	`report-uri ${CSP_REPORT_PATH}`,
	'report-to csp-endpoint',
].join('; ');

/**
 * Headers that can't break anything, so they enforce from the start. The admin
 * screens were framable by any site until now.
 */
const securityHeaders = [
	{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
	{ key: 'Content-Security-Policy-Report-Only', value: reportOnlyCsp },
	// What `report-to csp-endpoint` above resolves to. Same destination as
	// `report-uri`, declared the way the Reporting API wants it.
	{
		key: 'Reporting-Endpoints',
		value: `csp-endpoint="${CSP_REPORT_PATH}"`,
	},
	{ key: 'X-Frame-Options', value: 'DENY' },
	{ key: 'X-Content-Type-Options', value: 'nosniff' },
	{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
	{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
	// Two years, subdomains included. No `preload`, that is a one-way door onto
	// a browser-baked list and isn't ours to commit to from a config file.
	{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
	/**
	 * Which commit this bundle was built from, inlined so the running app can
	 * say so out loud. See `lib/build.ts`.
	 *
	 * Vercel sets `VERCEL_GIT_COMMIT_SHA` on every build. It also exposes a
	 * `NEXT_PUBLIC_`-prefixed copy, but only when the project has "automatically
	 * expose System Environment Variables" switched on, a dashboard setting
	 * nothing in this repo records or can check. Mapping it here means the
	 * feature works from a fresh clone and a fresh Vercel project, and it is
	 * `''` anywhere else, which is exactly what a local build should say.
	 */
	env: {
		NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? '',
	},
	// `shared/` lives outside this package, so Next has to be told it may compile
	// files from the repo root.
	outputFileTracingRoot: path.join(__dirname, '../'),
	experimental: {
		externalDir: true,
	},
	images: {
		remotePatterns: [{ protocol: 'https', hostname: 'lh3.googleusercontent.com' }],
	},
	async headers() {
		return [
			{
				source: '/:path*',
				headers: securityHeaders,
			},
			{
				// Without this the browser caches the worker and never picks up a
				// new one, which strands people on a stale build.
				source: '/sw.js',
				headers: [
					{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
					{ key: 'Service-Worker-Allowed', value: '/' },
				],
			},
		];
	},
};

/**
 * Whether this build should upload source maps.
 *
 * Both halves matter. The token is what makes an upload possible at all, and
 * `VERCEL` is what makes it *appropriate*: only a deploy produces a bundle
 * anybody will read a stack trace from.
 *
 * Without the `VERCEL` check, a token sitting in `frontend/.env.local` would
 * have every local build uploading, and the pre-commit hook runs one on every
 * frontend commit. Each would create a release named after the last commit,
 * from a working tree that may not match it, for a bundle that is deleted
 * seconds later. CI is covered by the same reasoning and simply has no token.
 *
 * To upload from a local build on purpose, set `VERCEL=1` for that one run.
 */
const hasUploadCredentials = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.VERCEL);

module.exports = withSentryConfig(nextConfig, {
	org: process.env.SENTRY_ORG,
	project: process.env.SENTRY_PROJECT,
	authToken: process.env.SENTRY_AUTH_TOKEN,

	/**
	 * Reports are posted to this app's own origin and proxied on to Sentry from
	 * the server, rather than going to `*.ingest.sentry.io` from the browser.
	 *
	 * Not premature: content blockers block Sentry's ingest hosts by name, and a
	 * good share of this group is on an iPhone. Without the tunnel those people
	 * report nothing and the inbox looks healthy, which is the exact failure
	 * this whole change exists to stop. It also means the CSP needs no new host:
	 * `connect-src 'self'` already covers a same-origin post.
	 *
	 * **The path is deliberately not `/monitoring`**, which is Sentry's
	 * documented default and therefore the one every filter list already knows.
	 * Pointing the tunnel at it was blocked with `ERR_BLOCKED_BY_CLIENT` on the
	 * first real test: a same-origin request, refused for looking like
	 * telemetry rather than for where it was going. Blockers match the path and
	 * the `?o=…&p=…` envelope signature, so the only part left to change is the
	 * path, and it has to be something no list would ever carry.
	 *
	 * Hence a word from the domain rather than from observability. If reports
	 * ever go quiet again with the SDK plainly working, suspect this first and
	 * check the console for `ERR_BLOCKED_BY_CLIENT` before anything else.
	 */
	tunnelRoute: '/api/whistle',

	sourcemaps: {
		// Nothing to upload to without a token, and a hard failure here would
		// break `pnpm build` for anybody who has never heard of Sentry.
		disable: !hasUploadCredentials,
		// Otherwise the maps ship to Vercel and stay publicly fetchable, which
		// de-minifies the whole app for everyone, not just for us.
		deleteSourcemapsAfterUpload: true,
	},

	// The plugin is chatty about a missing token on every single build.
	silent: !hasUploadCredentials,
	telemetry: false,
	// Pulls in the chunks Next serves from outside the default upload scope, so
	// a stack trace through a lazily loaded route is readable too.
	widenClientFileUpload: true,

	webpack: {
		treeshake: {
			// Sentry's own debug logging, which nothing here reads.
			removeDebugLogging: true,
			// Drops the entire performance-monitoring half of the SDK. It is dead
			// code given `tracesSampleRate: 0` in `lib/sentry.ts`, and leaving it
			// in costs 28 kB gzipped on the shared bundle, worth having on a
			// phone-first app. Turning tracing back on means deleting this line.
			removeTracing: true,
		},
	},
});
