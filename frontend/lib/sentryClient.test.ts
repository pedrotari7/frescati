/**
 * The net that catches a crash before the SDK has loaded.
 *
 * Worth testing for the same reason `lib/sentry.test.ts` is worth testing, only
 * more so: nothing here is on a path the app awaits, so every way this can
 * break is silent. The buffer quietly holding nothing, the replay quietly
 * running before the listeners come off and filing everything twice, the chunk
 * quietly being fetched on a local run. An app that works perfectly proves none
 * of it, and the reports this covers are the ones from a hydration crash, which
 * is the failure nobody can debug from a screenshot.
 *
 * Module state is set up at import, so each test drops the module and imports
 * it again rather than trying to reset it.
 */

import type * as SentryClientLib from './sentryClient';

type SentryClient = typeof SentryClientLib;

const captureException = vi.fn();
const loadSentry = vi.fn();

/** jsdom has no `requestIdleCallback`, so the fallback timer is the path here. */
const FALLBACK_DELAY_MS = 2000;

const A_DSN = 'https://key@o1.ingest.de.sentry.io/1';

/**
 * Import the module with the reporter switched on or off, after the mocks for
 * this test are in place.
 *
 * The options are spread over the defaults rather than destructured with them,
 * because a destructuring default fills in for an explicit `undefined` too, and
 * `dsn: undefined` is exactly the case one of these tests is about.
 */
const arm = async (options: { enabled?: boolean; dsn?: string } = {}): Promise<SentryClient> => {
	const sentryOptions = { enabled: true, dsn: A_DSN, ...options };

	vi.resetModules();
	vi.doMock('./sentry', () => ({ loadSentry, sentryOptions }));

	const sentryClient: SentryClient = await import('./sentryClient');

	sentryClient.deferSentry();

	return sentryClient;
};

/** What the SDK does once the chunk lands, as far as this module can tell. */
const sdkArrives = async () => {
	await vi.advanceTimersByTimeAsync(FALLBACK_DELAY_MS);
	// One more turn for the `then` on `loadSentry` to run.
	await vi.advanceTimersByTimeAsync(0);
};

const crash = (error: Error) => {
	// jsdom hands an `error` event nobody cancelled to its virtual console, and
	// vitest counts that as an unhandled error against whichever test is running.
	// Added after the module's own listener, so it still sees the event first.
	window.addEventListener('error', event => event.preventDefault(), { once: true });
	window.dispatchEvent(new ErrorEvent('error', { error, message: error.message, cancelable: true }));
};

const reject = (reason: unknown) => {
	// jsdom does not construct `PromiseRejectionEvent`, and the listener only
	// reads `reason`.
	const event = new Event('unhandledrejection') as Event & { reason: unknown };
	event.reason = reason;
	window.dispatchEvent(event);
};

describe('sentryClient', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		captureException.mockClear();
		loadSentry.mockReset().mockResolvedValue({ captureException });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.doUnmock('./sentry');
	});

	it('replays a crash that happened before the SDK arrived', async () => {
		await arm();

		const boom = new Error('hydration failed');
		crash(boom);
		reject('a rejection too');

		// Nothing has been reported yet. The SDK is not here.
		expect(captureException).not.toHaveBeenCalled();

		await sdkArrives();

		expect(captureException).toHaveBeenNthCalledWith(1, boom);
		expect(captureException).toHaveBeenNthCalledWith(2, 'a rejection too');
	});

	/**
	 * The SDK installs global handlers of its own. If ours were still attached
	 * the same throw would be reported twice, which is worse than useless: two
	 * issues for one bug, each looking half as common as it is.
	 */
	it('stops listening once the SDK has taken over', async () => {
		await arm();
		await sdkArrives();

		crash(new Error('after the handover'));
		await vi.advanceTimersByTimeAsync(0);

		expect(captureException).not.toHaveBeenCalled();
	});

	/** A page throwing in a loop must not grow the array until the tab dies. */
	it('holds a bounded number of errors', async () => {
		await arm();

		for (let i = 0; i < 50; i++) crash(new Error(`boom ${i}`));

		await sdkArrives();

		expect(captureException).toHaveBeenCalledTimes(10);
		expect(captureException).toHaveBeenLastCalledWith(new Error('boom 9'));
	});

	/**
	 * `dev:seeded` and `dev:live` both land here with a DSN configured and
	 * `enabled` false. Asking for the chunk anyway would download the whole SDK
	 * on every local page load to then report nothing.
	 */
	it('does not reach for the SDK on a run that reports nothing', async () => {
		await arm({ enabled: false });

		crash(new Error('boom'));
		await sdkArrives();

		expect(loadSentry).not.toHaveBeenCalled();
		expect(captureException).not.toHaveBeenCalled();
	});

	it('does not reach for the SDK when no DSN is configured', async () => {
		await arm({ dsn: undefined });

		await sdkArrives();

		expect(loadSentry).not.toHaveBeenCalled();
	});

	/**
	 * A chunk that will not load is the realistic failure at a pitch. It must
	 * not surface as an unhandled rejection about the reporter, on top of
	 * whatever it was trying to report.
	 */
	it('swallows an SDK that never arrives', async () => {
		loadSentry.mockRejectedValue(new Error('chunk load failed'));

		await arm();

		crash(new Error('boom'));

		await expect(sdkArrives()).resolves.not.toThrow();
		expect(captureException).not.toHaveBeenCalled();
	});

	/**
	 * With tracing off this records nothing either way. What it must not do is
	 * throw on a navigation that happens before the SDK has loaded, which is
	 * every navigation in the first couple of seconds.
	 */
	it('forwards a router transition only once there is an SDK to forward it to', async () => {
		const captureRouterTransitionStart = vi.fn();
		loadSentry.mockResolvedValue({ captureException, captureRouterTransitionStart });

		const { captureRouterTransitionStart: forward } = await arm();

		expect(() => forward('/s/1', '/s/1/table')).not.toThrow();
		expect(captureRouterTransitionStart).not.toHaveBeenCalled();

		await sdkArrives();

		forward('/s/1', '/s/1/table');
		expect(captureRouterTransitionStart).toHaveBeenCalledWith('/s/1', '/s/1/table');
	});
});
