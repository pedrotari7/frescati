'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Unsubscribe } from 'firebase/firestore';
import { captureError } from '../lib/sentry';

export interface SubscriptionResult<T> {
	data: T;
	loading: boolean;
	error: Error | null;
	/** Subscribe again after a failure. A no-op while one is already healthy. */
	retry: () => void;
}

type Subscribe<T> = (onChange: (value: T) => void, onError: (error: Error) => void) => Unsubscribe;

/** React's own deps comparison: same length, `Object.is` on each. */
const sameDeps = (settled: unknown[] | null, current: unknown[]): boolean =>
	settled !== null &&
	settled.length === current.length &&
	settled.every((value, index) => Object.is(value, current[index]));

/**
 * Shared plumbing for every `onSnapshot` in the app: tracks loading and error
 * state and tears the listener down on unmount.
 *
 * Pass `null` for `subscribe` when the inputs aren't ready yet (no season id,
 * no signed-in user), the hook settles into "not loading" rather than
 * subscribing to a half-built path.
 *
 * `deps` is what the subscription is keyed on; it is deliberately caller-owned
 * because `subscribe` is a fresh closure on every render.
 *
 * `source` names the subscription for `captureError` below. A listener's error
 * callback is not a rejected promise: nothing about it becomes an unhandled
 * rejection for Sentry's default browser instrumentation to pick up on its
 * own, unlike almost every other failure in this app, so this is the one
 * place that has to report it, and `source` is what turns "a subscription
 * failed" into "which one".
 *
 * `retry` re-runs the effect by bumping a counter in its deps. Firestore tears
 * a listener down for good when it hands one to `onError`, so there is nothing
 * left to resume. The only way back is a fresh `onSnapshot`, and a screen
 * showing a failure needs something to offer besides a page reload.
 *
 * `loading` is reported from the render rather than only from the effect,
 * because an effect runs after the render that scheduled it. Left to the
 * effect alone there is one render per deps change where the hook says it has
 * settled and hands back the previous query's answer, and a screen gating on
 * `loading` draws that answer as though it were this one. The finances screen
 * is where it showed: `useDues` re-subscribes when the reader turns out to be
 * in the squad, and an admin who pressed "Check what is missing" in that frame
 * was told the whole season was unbilled off a book they could not see yet.
 */
export const useFirestoreSubscription = <T>(
	initial: T,
	subscribe: Subscribe<T> | null,
	deps: unknown[],
	source: string
): SubscriptionResult<T> => {
	const [data, setData] = useState<T>(initial);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const [attempt, setAttempt] = useState(0);
	/** Which subscription `data`, `loading` and `error` above are the answer to. */
	const [settledFor, setSettledFor] = useState<unknown[] | null>(null);

	const retry = useCallback(() => setAttempt(current => current + 1), []);

	const key = [...deps, attempt];

	useEffect(() => {
		// `key` is a fresh array every render, so the second snapshot off a
		// healthy listener would otherwise be a state change with nothing behind
		// it.
		const settle = () => setSettledFor(previous => (sameDeps(previous, key) ? previous : key));

		if (!subscribe) {
			setLoading(false);
			settle();
			return;
		}

		setLoading(true);

		const unsubscribe = subscribe(
			value => {
				setData(value);
				setError(null);
				setLoading(false);
				settle();
			},
			subscriptionError => {
				console.error('Firestore subscription failed', subscriptionError);
				setError(subscriptionError);
				setLoading(false);
				settle();
				void captureError(subscriptionError, { source });
			}
		);

		return unsubscribe;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [...deps, attempt]);

	// `error` is left as it was on purpose. A screen reads `loading` first and
	// draws its skeleton, so the stale failure is never on screen, and clearing
	// it here would take the retry button away from the one case that needs it:
	// a listener that errors on every attempt.
	return { data, loading: loading || !sameDeps(settledFor, key), error, retry };
};
