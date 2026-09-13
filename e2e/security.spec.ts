import { expect, test } from '@playwright/test';

/**
 * The headers the app actually serves.
 *
 * The Content-Security-Policy enforces rather than reporting, which makes it
 * the one piece of configuration in this repo that can break the whole app
 * without breaking a single test anywhere else. `next.config.js` is read by no
 * unit suite, `headers()` runs at build time, and a header is invisible to a
 * jsdom render, so up to here nothing at all has ever looked at it.
 *
 * The rest of this suite is the real check: every spec drives the built app
 * through sign-in, the Firestore listeners, a callable and the receipts in
 * Cloud Storage against this policy, and a directive that refused any of them
 * fails those rather than this. What is left for this file is the handful of
 * claims a passing suite cannot make, because they are about what the policy
 * says rather than about what it let through.
 *
 * **This spec writes nothing**, like `nav.spec.ts` and `admin.spec.ts`, so it
 * can overlap with all of them.
 */

/** The policy on the app's own responses, as one string. */
const policy = async (request: { get: (url: string) => Promise<{ headers: () => Record<string, string> }> }) => {
	const response = await request.get('/seasons');

	return response.headers();
};

test.describe('the security headers', () => {
	test('enforces the content policy rather than reporting it', async ({ request }) => {
		const headers = await policy(request);

		expect(headers['content-security-policy'], 'no enforcing policy is being served').toBeTruthy();
		expect(
			headers['content-security-policy-report-only'],
			'the report-only header is still being sent beside the enforcing one'
		).toBeUndefined();
	});

	/**
	 * The reporting directives survive the flip, and they are the only warning
	 * anybody gets that an enforcing policy has started refusing something real.
	 * They work on an enforcing policy, so dropping them would be silent.
	 */
	test('still says where to post a violation', async ({ request }) => {
		const headers = await policy(request);

		expect(headers['content-security-policy']).toContain('report-uri /api/csp-report');
		expect(headers['content-security-policy']).toContain('report-to csp-endpoint');
		expect(headers['reporting-endpoints']).toContain('/api/csp-report');
	});

	/**
	 * `frame-ancestors` had a header of its own only because report-only ignores
	 * that directive. Two headers of the same name are two policies, and a
	 * browser enforces the intersection, which is a confusing way to write one
	 * policy down and an easy thing to reintroduce.
	 */
	test('says it all in one header', async ({ request }) => {
		const headers = await policy(request);

		expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
		expect(headers['x-frame-options']).toBe('DENY');
	});

	/**
	 * The regression report-only was hiding, and the reason this file exists.
	 *
	 * `scripts/e2e-stack.sh` builds with `NEXT_PUBLIC_USE_EMULATORS=1` and serves
	 * the result with `next start`, so `NODE_ENV` is `production` here. While the
	 * emulator origins were gated on a dev server they were left out of exactly
	 * this build, which talks to nothing else. Reporting, that cost noise.
	 * Enforcing, it refuses every listener, every sign-in and every callable in
	 * the suite, and the failure looks like a broken app rather than a header.
	 */
	test('lets this build reach the emulators it was built to talk to', async ({ request }) => {
		const headers = await policy(request);

		expect(headers['content-security-policy']).toContain('http://127.0.0.1:*');
		expect(headers['content-security-policy']).toContain('ws://127.0.0.1:*');
	});

	/**
	 * The other half of that gate. A production build evaluates no modules
	 * through `eval`, so the dev server's allowance must not be reaching one,
	 * and this build is the nearest thing to a deploy anything here can inspect.
	 */
	test('keeps the dev server allowances out of a production build', async ({ request }) => {
		const headers = await policy(request);

		expect(headers['content-security-policy']).not.toContain('unsafe-eval');
		expect(headers['content-security-policy']).not.toContain('va.vercel-scripts.com');
	});
});
