import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end, against the whole stack.
 *
 * Every other suite here stops at a seam. `shared/` is pure, the frontend tests
 * render components over mocked modules, the rules tests drive Firestore with no
 * app in front of it, and the backend tests call handlers directly with
 * hand-built events. Nothing joins them up — so the one path the group actually
 * uses, tap In and watch the headcount move, is covered in four pieces and not
 * once end to end. That path crosses the client, the security rules, a
 * background trigger and a realtime listener, and each of those is exactly where
 * the others stop looking.
 *
 * The harness for it was already here. `dev:seeded` starts every emulator,
 * seeds a real scenario and runs the app against it; `pnpm seed` derives its
 * data from `shared/` so a seeded database is one the functions could have
 * produced; and `DevUserSwitcher` signs in as any seeded player without Google,
 * which is the hardest part of testing an app with one way in. All this adds is
 * a browser.
 *
 * Two viewports, because mobile is the primary target and every UI change is
 * meant to work on both. A journey that passes only at 1280px has not been
 * tested on the device the group opens this on at the pitch.
 */

/** The dev server is slow to first paint on a cold Next.js build. */
const START_TIMEOUT = 240_000;

export default defineConfig({
	testDir: './e2e',
	// Serialised: one seeded emulator database behind every test, and a spec
	// that answers a game changes what the next one reads. The same call the
	// backend and rules suites make.
	workers: 1,
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
	timeout: 60_000,
	expect: {
		// A trigger has to round-trip through the emulator and back down the
		// listener before an assertion about `counts` can pass.
		timeout: 15_000,
	},
	use: {
		baseURL: 'http://127.0.0.1:3000',
		trace: 'retain-on-failure',
		video: 'retain-on-failure',
	},
	projects: [
		{ name: 'mobile', use: { ...devices['Pixel 5'] } },
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
	],
	/**
	 * The whole stack in one command. Not `dev:seeded`, which adds the emulator
	 * UI nobody is watching here — but the same shape, plus a backend build,
	 * without which the functions emulator serves stale handlers and the
	 * headcount these tests assert on never moves.
	 */
	webServer: {
		command: 'pnpm dev:e2e',
		url: 'http://127.0.0.1:3000',
		timeout: START_TIMEOUT,
		// Locally, reuse whatever the developer already has running.
		reuseExistingServer: !process.env.CI,
		stdout: 'pipe',
		stderr: 'pipe',
	},
});
