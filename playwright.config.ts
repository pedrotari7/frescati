import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end, against the whole stack.
 *
 * Every other suite here stops at a seam. `shared/` is pure, the frontend tests
 * render components over mocked modules, the rules tests drive Firestore with no
 * app in front of it, and the backend tests call handlers directly with
 * hand-built events. Nothing joins them up, so the one path the group actually
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

/**
 * Long, because starting up is genuinely a lot of work: a backend compile, a
 * frontend build, every emulator, and a seed that waits for its own triggers to
 * go quiet before it will call the database finished.
 */
const START_TIMEOUT = 240_000;

export default defineConfig({
	testDir: './e2e',
	// One worker per spec file, and no more. There is a single seeded emulator
	// database behind all of this, so what can safely overlap is decided by what
	// the specs touch rather than by how many cores are going spare: the seven
	// files are disjoint: responses on the next game, the kit register, the
	// scoreline and vote on a played one, the dues of two seasons, one season's
	// receipts, and two that write nothing at all for exactly this reason, the
	// admin calendar and the way back out of a screen, while the tests *inside* a
	// file deliberately hand state to each other. `fullyParallel: false` is what
	// draws that line, giving each file to one worker and keeping its tests in
	// order.
	workers: 7,
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
		// Runs only once mobile is done, and that is the other half of the
		// worker count above. The two viewports run the *same* specs against the
		// same database: the same member's response document, the same ball,
		// the same scoreline, so left to overlap they are not two viewports but
		// two people racing for one row. `dependencies` is the ordering
		// Playwright already has for this; the alternative is teaching every
		// fixture to pick a different player per project, which buys nothing
		// here because the file-level parallelism above is what the time goes on.
		//
		// Two things it costs, both worth knowing when reading a red run: asking
		// for `--project=desktop` runs mobile first, so it is not a way to test
		// one viewport; and a failure in mobile leaves desktop reported as never
		// run rather than as passing.
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] }, dependencies: ['mobile'] },
	],
	/**
	 * The whole stack in one command: `scripts/e2e-stack.sh`, which builds both
	 * halves, boots every emulator, seeds a real scenario and serves the built
	 * app. Not `dev:seeded`: that adds the emulator UI nobody is watching here,
	 * and it runs `next dev`, which compiles each route the first time a test
	 * opens it and re-renders every page through webpack's eval'd modules.
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
