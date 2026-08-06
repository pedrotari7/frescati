'use client';

import { useCallback, useEffect, useState } from 'react';
import { getPushDevices } from '../lib/db/pushDevices';
import type { PushDevicesByUid } from '../lib/db/pushDevices';

const NO_DEVICES: PushDevicesByUid = {};

/**
 * Registered devices for everybody, fetched once.
 *
 * The only thing in the app that isn't realtime, because it is the only thing
 * that can't be: push tokens are unreadable from the client by design, so this
 * comes back from a callable rather than an `onSnapshot`. `reload` is what the
 * screen offers instead — an admin watching somebody turn notifications on over
 * the phone needs a way to ask again, and a refresh button is more honest than
 * a poll that hides how stale the answer is.
 *
 * `enabled` is false for anyone who isn't an app admin: the function would
 * reject them, and firing a call that is certain to fail just to render the
 * "admins only" screen puts a permission error in their console.
 */
export const usePushDevices = (enabled: boolean) => {
	const [devices, setDevices] = useState<PushDevicesByUid>(NO_DEVICES);
	const [loading, setLoading] = useState(enabled);
	const [error, setError] = useState<Error | null>(null);

	const reload = useCallback(async () => {
		if (!enabled) return;

		setLoading(true);

		try {
			setDevices(await getPushDevices());
			setError(null);
		} catch (caught) {
			console.error('Could not load registered devices', caught);
			setError(caught instanceof Error ? caught : new Error('Could not load registered devices'));
		} finally {
			setLoading(false);
		}
	}, [enabled]);

	useEffect(() => {
		if (!enabled) {
			setLoading(false);
			return;
		}

		void reload();
	}, [enabled, reload]);

	return { devices, loading, error, reload };
};
