'use client';

import { useEffect, useState } from 'react';
import type { Unsubscribe } from 'firebase/firestore';

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
 */
export const useFirestoreSubscription = <T>(
	initial: T,
	subscribe: Subscribe<T> | null,
	deps: unknown[]
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
			}
		);

		return unsubscribe;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);

	return { data, loading, error };
};
