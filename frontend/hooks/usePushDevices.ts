'use client';

import { useCallback, useEffect, useState } from 'react';
import { getNotificationReach } from '../lib/db/pushDevices';
import type { NotificationReach } from '../lib/db/pushDevices';
import { captureError } from '../lib/sentry';

/**
 * Nothing registered, nothing addressable, nothing configured — what every row
 * reads as before the call comes back, and what it falls back to if the call
 * fails. Erring towards "can't reach them" is the safe direction for a screen
 * whose whole job is to find the people nothing arrives for.
 */
const NOTHING: NotificationReach = { devices: {}, addressed: new Set(), emailConfigured: false };

/**
 * How the app can reach everybody, fetched once.
 *
 * The only thing in the app that isn't realtime, because it is the only thing
 * that can't be: push tokens and email addresses are both unreadable from the
 * client by design, so this comes back from a callable rather than an
 * `onSnapshot`. `reload` is what the screen offers instead — an admin watching
 * somebody turn notifications on over the phone needs a way to ask again, and a
 * refresh button is more honest than a poll that hides how stale the answer is.
 *
 * `enabled` is false for anyone who isn't an app admin: the function would
 * reject them, and firing a call that is certain to fail just to render the
 * "admins only" screen puts a permission error in their console.
 */
export const usePushDevices = (enabled: boolean) => {
	const [reach, setReach] = useState<NotificationReach>(NOTHING);
	const [loading, setLoading] = useState(enabled);
	const [error, setError] = useState<Error | null>(null);

	const reload = useCallback(async () => {
		if (!enabled) return;

		setLoading(true);

		try {
			setReach(await getNotificationReach());
			setError(null);
		} catch (caught) {
			console.error('Could not load how the app reaches people', caught);
			setError(caught instanceof Error ? caught : new Error('Could not load how the app reaches people'));
			void captureError(caught, { stage: 'getNotificationReach' });
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

	return { reach, loading, error, reload };
};
