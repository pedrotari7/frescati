/**
 * The deliberate failures an app admin can fire from the debug screen.
 *
 * Shared because the callable and its client wrapper both name them, and a
 * union that drifted would fail as an `invalid-argument` at the worst possible
 * moment — while somebody is trying to work out whether error reporting works.
 *
 * Frontend-only kinds are *not* here: the backend never sees them, so they live
 * next to the buttons that raise them.
 */

/**
 * Each of these exercises a different path through `backend/src/lib/sentry.ts`,
 * and the three together are what proves the wiring rather than just one lucky
 * case.
 */
export type BackendErrorKind =
	/** Thrown out of the handler. `instrument` reports it, then rethrows. */
	| 'throw'
	/**
	 * Also thrown, and deliberately **not** reported — an `HttpsError` is a
	 * decision the code made, not a fault. This is the only way to check that
	 * filter is working, and it is the one worth checking: if it broke, the
	 * inbox would fill with the authorization layer behaving correctly and stop
	 * being read.
	 */
	| 'httpsError'
	/**
	 * Reported via `reportError` and then swallowed, exactly as the sweeps do.
	 * The call returns successfully — the whole point being that a failure
	 * reaches Sentry from a request that looked completely fine.
	 */
	| 'swallowed';

export const BACKEND_ERROR_KINDS: BackendErrorKind[] = ['throw', 'httpsError', 'swallowed'];
