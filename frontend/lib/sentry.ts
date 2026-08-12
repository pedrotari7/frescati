/**
 * Where client-side crashes go.
 *
 * The app talks to Firestore straight from the browser, so almost everything
 * that can go wrong goes wrong on somebody's phone — a rule that says no, an
 * expired session, a bundle half-updated by a stale service worker. None of
 * that reaches a server log, which meant the only way it ever surfaced was
 * somebody mentioning at the pitch that the app "wasn't working".
 *
 * Unconfigured it is inert, deliberately, the same way the email transport is:
 * `Sentry.init` with no DSN disables the SDK, so a fork of this repo with no
 * Sentry account behaves exactly as it did before this existed.
 *
 * These options are shared by the browser, Node and edge runtimes rather than
 * written out three times, so a filter added for one can't quietly not apply
 * to the others.
 */

/** Type-only, so naming the SDK here pulls none of it into the bundle. */
import type * as SentryModule from '@sentry/nextjs';

/**
 * Public, like every other `NEXT_PUBLIC_` value and like the Firebase config
 * beside it. A DSN authorizes *writing* an event to one project and nothing
 * else — it reads nothing back, which is why shipping it in the bundle is the
 * documented way to use it rather than a leak.
 */
const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Vercel sets this to `production`, `preview` or `development`. Kept separate
 * so a broken preview deploy can't page anybody about production, and so the
 * two don't group into one issue and hide each other.
 */
const ENVIRONMENT = process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development';

/** Matches `firebaseClient.ts` — a seeded local stack is not worth reporting. */
const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === '1';

/**
 * Whether a deploy built this. Vercel sets `NEXT_PUBLIC_VERCEL_ENV`; `next dev`
 * does not, which is what the fallback above is for.
 *
 * The emulator check alone was not the "nothing from a local run" rule it read
 * as: `dev:live` is a local dev server that sets `NEXT_PUBLIC_USE_EMULATORS=0`,
 * so it passed the check and reported. What it reported was mostly `next dev`
 * itself — webpack hands every module through HMR, and a chunk swapped under a
 * page that is still running throws `undefined is not a function` from the
 * webpack runtime on every hot update. That arrived 112 times in a day, into
 * the same inbox as production, tagged `development` on `localhost:3000`.
 *
 * Filtering the message instead would have been wrong: the same throw from a
 * real build is a real bug — see the chunk that failed to load on somebody's
 * phone — and an `ignoreErrors` entry could not tell the two apart. Where it
 * came from can.
 *
 * To report from a local run on purpose, set `NEXT_PUBLIC_VERCEL_ENV` for that
 * one run — the same shape of escape hatch as `VERCEL=1` for source maps in
 * `next.config.js`.
 */
const isDeployed = Boolean(process.env.NEXT_PUBLIC_VERCEL_ENV);

/**
 * Conditions, not bugs. Every one of these would otherwise arrive constantly
 * and train us to ignore the inbox, which costs more than the handful of real
 * reports hiding behind them.
 */
const ignoreErrors = [
	// Fires on layout thrash in every browser and means nothing.
	/ResizeObserver loop/,
	// A phone on pitch-side signal. Firestore recovers on its own — that is what
	// the offline cache is for — so this describes the walk to the ground, not a
	// defect. `permission-denied` is deliberately *not* here: a rule refusing a
	// write the UI offered is a genuine disagreement worth seeing.
	/client is offline/,
	/Failed to get document because the client is offline/,
	// Dismissing the Google popup. `Login.tsx` already swallows the two codes it
	// can see; this catches the same thing arriving as an unhandled rejection
	// from a token refresh racing a closed window.
	/auth\/popup-closed-by-user/,
	/auth\/cancelled-popup-request/,
	// Chrome fires this when a fetch is cut off by a navigation, which on a
	// mobile PWA mostly means somebody tapped a link while a listener was
	// mid-flight.
	/Failed to fetch/,
	/Load failed/,
	// Firefox for iOS injects `window.__firefox__` for its own reader mode and
	// video-quality controls. When that injection lands slightly out of sync
	// with the page, referencing it throws — a Mozilla-authored global no app
	// code ever touches, so this never correlates with anything of ours.
	/__firefox__/,
];

export const sentryOptions = {
	dsn: DSN,
	environment: ENVIRONMENT,
	/**
	 * Off, on purpose, and worth saying why rather than leaving at a default.
	 *
	 * Tracing and Session Replay are the two things people switch on next, and
	 * Replay records the DOM — which here is a roster of real names, who is
	 * playing where and when. That is a materially bigger collection than "a
	 * stack trace when something breaks", and it is not something to turn on
	 * before there is a privacy notice saying so.
	 */
	tracesSampleRate: 0,
	/** No IP addresses, no cookies, no headers. See `setSentryUser` below. */
	sendDefaultPii: false,
	ignoreErrors,
	/**
	 * A DSN left blank already disables the SDK; this additionally keeps every
	 * local run quiet for anybody who *has* configured one — `dev:seeded` and
	 * `dev:live` alike.
	 */
	enabled: isDeployed && !useEmulators,
};

/**
 * Load the SDK and do something with it, swallowing anything that goes wrong.
 *
 * Every caller below is invoked from a place that has already handled the real
 * failure — a toast is on screen, a fallback is rendered. A rejection here
 * would surface as an unhandled rejection *about the reporter*, on top of the
 * problem being reported, and the import genuinely can fail: it is a lazily
 * fetched chunk, and this app is used at a pitch on one bar of signal.
 * Telemetry that can break the page it watches is not worth having.
 *
 * Resolving rather than rejecting is load-bearing for `captureErrorAndFlush`
 * too, whose caller waits on it before recovering the app. A reporter that
 * failed must not also strand the person on a broken screen.
 */
/** `unknown` rather than `void`: the SDK's calls return ids and flags nobody
 * here reads, and a `void` return type stops accepting those the moment the
 * signature also has to allow a promise to await. */
const withSentry = async (run: (sentry: typeof SentryModule) => unknown) => {
	try {
		await run(await import('@sentry/nextjs'));
	} catch {
		// Nothing to escalate to. If the reporter is down, it cannot report that.
	}
};

/**
 * Attach — or clear — who is signed in.
 *
 * The uid and nothing else. It is enough to tell "this breaks for one person"
 * from "this breaks for everybody", which is the only question an error report
 * needs an identity for, and it is the same line `forget-player` draws: an
 * opaque id with nothing hanging off it survives, the name and the address do
 * not. Sentry never learns who `Kk3s…` is.
 */
export const setSentryUser = async (uid: string | null) => {
	if (!DSN) return;

	await withSentry(Sentry => Sentry.setUser(uid ? { id: uid } : null));
};

/**
 * Report something we caught and handled.
 *
 * The unhandled ones arrive on their own. This is for the failures the app
 * deliberately absorbs — a rejected write that only became a toast, a profile
 * sync that was allowed to fail quietly — which are exactly the ones nobody
 * would otherwise ever hear about.
 */
export const captureError = async (error: unknown, context: Record<string, unknown> = {}) => {
	if (!DSN) return;

	await withSentry(Sentry => Sentry.captureException(error, { extra: context }));
};

/**
 * Report something, and wait for it to actually leave the device.
 *
 * `captureError` only *queues* — the SDK batches events and sends them on its
 * own schedule, which is fine everywhere the page carries on afterwards. It is
 * not fine for the one caller that reports and then reloads: the queue lives in
 * the page, so the reload takes it, and the report explaining why the reload
 * happened is the single report guaranteed never to arrive.
 *
 * Resolves either way. A flush that times out still hands control back, because
 * the caller's next move is recovering the app, and telemetry does not get a
 * veto over that — the same reason `instrument()` rethrows on the backend.
 */
export const captureErrorAndFlush = async (error: unknown, context: Record<string, unknown> = {}, timeoutMs = 2000) => {
	if (!DSN) return;

	await withSentry(async Sentry => {
		Sentry.captureException(error, { extra: context });
		await Sentry.flush(timeoutMs);
	});
};
