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

	const retry = useCallback(() => setAttempt(current => current + 1), []);

	useEffect(() => {
		if (!subscribe) {
			setLoading(false);
			return;
		}

		setLoading(true);

		const unsubscribe = subscribe(
			value => {
				setData(value);
				setError(null);
				setLoading(false);
			},
			subscriptionError => {
				console.error('Firestore subscription failed', subscriptionError);
				setError(subscriptionError);
				setLoading(false);
				void captureError(subscriptionError, { source });
			}
		);

		return unsubscribe;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [...deps, attempt]);

	return { data, loading, error, retry };
};
