const path = require('path');

/*
 * Content Security Policy, shipped in report-only mode.
 *
 * The app talks to a lot of Google hosts — Firestore over gRPC-web, the
 * identity toolkit, FCM registration, avatars on googleusercontent — and Next
 * inlines both its hydration script and its critical CSS. A policy written
 * blind and enforced immediately breaks sign-in or the live listeners in
 * production, which is the one place it can't be debugged safely.
 *
 * So this reports rather than blocks: violations appear in the browser console
 * without anything failing. Watch it for a few days of real use, tighten what
 * turns out to be unnecessary, then switch the header name to the enforcing one.
 *
 * `frame-ancestors` is the exception — it is ignored in report-only mode, so it
 * ships enforcing in its own header below, alongside X-Frame-Options. That is
 * the clickjacking protection, and it can't break a same-origin app.
 */
const reportOnlyCsp = [
	"default-src 'self'",
	// Next inlines the hydration payload; there's no nonce plumbed through.
	"script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com",
	// Tailwind and Next both inject style tags.
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https://*.googleusercontent.com https://*.google.com",
	"font-src 'self' data:",
	// Firestore listeners, auth, and FCM registration.
	"connect-src 'self' https://*.googleapis.com https://*.google.com https://*.firebaseio.com wss://*.firebaseio.com https://*.gstatic.com",
	// The auth helper iframe.
	"frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
	"worker-src 'self'",
	"manifest-src 'self'",
	"base-uri 'self'",
	"form-action 'self'",
	"object-src 'none'",
].join('; ');

/**
 * Headers that can't break anything, so they enforce from the start. The admin
 * screens were framable by any site until now.
 */
const securityHeaders = [
	{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
	{ key: 'Content-Security-Policy-Report-Only', value: reportOnlyCsp },
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
