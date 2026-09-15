/**
 * The browser half of the reporter: when the SDK loads, and what catches a
 * crash in the meantime.
 *
 * `instrumentation-client.ts` is loaded by Next before any of the app runs, and
 * it used to import the SDK at module scope and call `init` there. That is what
 * let it catch a crash during hydration, the one place an error boundary cannot
 * help, because there is no mounted tree to fall back to. It also put the whole
 * SDK on the critical path of every route: 70 kB gzipped of the 172 kB shared
 * first load, downloaded and parsed before anything could hydrate, to watch for
 * something that almost never happens.
 *
 * So the two jobs are split. Two native listeners, which cost nothing, hold on
 * to whatever goes wrong before the SDK arrives, and the SDK itself is fetched
 * on idle and replays them. A hydration crash is still reported, a second or
 * two later than it used to be.
 *
 * What is genuinely lost is the context the SDK collects for itself between
 * page start and `init`: the console calls, fetches and clicks it turns into
 * breadcrumbs. An early report now arrives with its stack and nothing around
 * it. That is the trade, and on a phone-first app it is worth 70 kB.
 *
 * Here rather than in `instrumentation-client.ts` so the suite can reach it.
 * That file is an entry point Next owns the name of, and the frontend suite
 * only looks in `components`, `hooks` and `lib`.
 */

import type * as SentryModule from '@sentry/nextjs';
import { loadSentry, sentryOptions } from './sentry';

/**
 * Enough to cover a crash and the handful of rejections that tend to follow it,
 * and short enough that a page stuck in a throwing loop cannot grow the array
 * until the tab dies.
 */
const MAX_BUFFERED = 10;

/** Idle, but not never: a busy page might not offer one before this. */
const IDLE_TIMEOUT_MS = 5000;

/** Safari has no `requestIdleCallback`, and half this group is on an iPhone. */
const FALLBACK_DELAY_MS = 2000;

/** The SDK, for `captureRouterTransitionStart`, which cannot await anything. */
let sentry: typeof SentryModule | undefined;

/** Whether the SDK has taken over. See `handOver`. */
let handedOver = false;

const buffered: unknown[] = [];

const remember = (error: unknown) => {
	if (handedOver || buffered.length >= MAX_BUFFERED) return;

	buffered.push(error);
};

const onError = (event: ErrorEvent) => remember(event.error ?? event.message);
const onRejection = (event: PromiseRejectionEvent) => remember(event.reason);

/**
 * Stand down, then replay.
 *
 * In that order, and it matters: `init` has installed the SDK's own global
 * handlers by the time this runs, so anything thrown from here on would be seen
 * by both it and the two listeners above and reported twice. Dropping ours
 * first leaves exactly one reporter attached at every moment.
 */
const handOver = (Sentry: typeof SentryModule) => {
	sentry = Sentry;
	handedOver = true;

	window.removeEventListener('error', onError);
	window.removeEventListener('unhandledrejection', onRejection);

	buffered.forEach(error => Sentry.captureException(error));
	buffered.length = 0;
};

/**
 * Start watching, and book the SDK in for whenever the page is next idle.
 *
 * Does nothing at all on a build with no DSN or on a local run.
 * `sentryOptions.enabled` is the same check the SDK would make after loading;
 * making it here means the chunk is never asked for in the first place.
 */
export const deferSentry = () => {
	if (!sentryOptions.enabled || !sentryOptions.dsn) return;

	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);

	// Swallowed for the reason `withSentry` swallows: a reporter that failed to
	// load must not then crash the page it was watching.
	const start = () => void loadSentry().then(handOver, () => undefined);

	// Widened rather than tested with `in`, which narrows the other branch to
	// `never`: lib.dom declares this as always present on `Window`, and Safari
	// is the browser that disagrees.
	const idle = window.requestIdleCallback as typeof window.requestIdleCallback | undefined;

	if (idle) idle(start, { timeout: IDLE_TIMEOUT_MS });
	else window.setTimeout(start, FALLBACK_DELAY_MS);
};

/**
 * Next hands router navigations here. With tracing off this records nothing,
 * it is exported because the SDK prints an ACTION REQUIRED notice on every
 * build without it, and a standing warning nobody intends to act on is how real
 * ones start getting scrolled past.
 *
 * Which is also why it can forward to whatever is loaded and stop there. There
 * is nothing to queue for a navigation that happened before the SDK arrived:
 * turning `tracesSampleRate` back up is what would make this record anything,
 * and that is a deliberate change with a privacy note attached, see
 * `lib/sentry.ts`.
 */
export const captureRouterTransitionStart: typeof SentryModule.captureRouterTransitionStart = (...args) =>
	sentry?.captureRouterTransitionStart(...args);
