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
	 * A DSN left blank already disables the SDK; this additionally keeps a
	 * `dev:seeded` run quiet for anybody who *has* configured one.
	 */
	enabled: !useEmulators,
};

/**
 * Load the SDK and do something with it, swallowing anything that goes wrong.
 *
 * Both callers below are fired with `void` from places that have already
 * handled the real failure — a toast is on screen, a fallback is rendered. A
 * rejection here would surface as an unhandled rejection *about the reporter*,
 * on top of the problem being reported, and the import genuinely can fail: it
 * is a lazily fetched chunk, and this app is used at a pitch on one bar of
 * signal. Telemetry that can break the page it watches is not worth having.
 */
const withSentry = async (run: (sentry: typeof SentryModule) => void) => {
	try {
		run(await import('@sentry/nextjs'));
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
