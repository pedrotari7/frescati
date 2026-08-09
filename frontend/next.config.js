const path = require('path');

/** Where the browser posts violations. See `app/api/csp-report/route.ts`. */
const CSP_REPORT_PATH = '/api/csp-report';

/*
 * Content Security Policy, shipped in report-only mode.
 *
 * The app talks to a lot of Google hosts — Firestore over gRPC-web, the
 * identity toolkit, FCM registration, reCAPTCHA for App Check, avatars on
 * googleusercontent — and Next inlines both its hydration script and its
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
 * `dangerouslySetInnerHTML` anywhere in the app — every user-supplied string
 * goes through a React text node — so the injected-script surface is close to
 * zero, and the real authorization boundary is Firestore rules. This is
 * defence in depth against a compromised dependency, and `script-src
 * 'unsafe-inline'` blunts most of that, since an injected inline script would
 * still run. Removing it needs a nonce, which needs middleware, which would
 * deopt every statically rendered page. That trade hasn't been taken.
 *
 * `frame-ancestors` is the exception — it is ignored in report-only mode, so it
 * ships enforcing in its own header below, alongside X-Frame-Options. That is
 * the clickjacking protection, and it can't break a same-origin app.
 */
const reportOnlyCsp = [
	"default-src 'self'",
	// Next inlines the hydration payload; there's no nonce plumbed through.
	// `www.google.com` serves reCAPTCHA Enterprise, which App Check loads.
	"script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://www.google.com",
	// Tailwind and Next both inject style tags.
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https://*.googleusercontent.com https://*.google.com",
	"font-src 'self' data:",
	// Firestore listeners, auth, FCM registration and App Check attestation —
	// the last of those on firebaseappcheck.googleapis.com.
	"connect-src 'self' https://*.googleapis.com https://*.google.com https://*.firebaseio.com wss://*.firebaseio.com https://*.gstatic.com",
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
	// Two years, subdomains included. No `preload` — that is a one-way door onto
	// a browser-baked list and isn't ours to commit to from a config file.
	{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/** @type {import('next').NextConfig} */
module.exports = {
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
