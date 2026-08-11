'use client';

import { useEffect, useState } from 'react';
import type { Unsubscribe } from 'firebase/firestore';
import { captureError } from '../lib/sentry';

export interface SubscriptionResult<T> {
	data: T;
	loading: boolean;
	error: Error | null;
}

type Subscribe<T> = (onChange: (value: T) => void, onError: (error: Error) => void) => Unsubscribe;

/**
 * Shared plumbing for every `onSnapshot` in the app: tracks loading and error
 * state and tears the listener down on unmount.
 *
 * Pass `null` for `subscribe` when the inputs aren't ready yet (no season id,
 * no signed-in user) — the hook settles into "not loading" rather than
 * subscribing to a half-built path.
 *
 * `deps` is what the subscription is keyed on; it is deliberately caller-owned
 * because `subscribe` is a fresh closure on every render.
 *
 * `source` names the subscription for `captureError` below. A listener's error
 * callback is not a rejected promise — nothing about it becomes an unhandled
 * rejection for Sentry's default browser instrumentation to pick up on its
 * own, unlike almost every other failure in this app — so this is the one
 * place that has to report it, and `source` is what turns "a subscription
 * failed" into "which one".
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
	}, deps);

	return { data, loading, error };
};
