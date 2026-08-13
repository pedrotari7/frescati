'use client';

import { useCallback, useEffect, useState } from 'react';
import { getGameWatchers } from '../lib/db/watchers';
import { captureError } from '../lib/sentry';

/**
 * Who is following one game, fetched once.
 *
 * Modelled on `usePushDevices`, and not realtime for the same reason: the
 * collection behind it is unreadable from the client by design, so this comes
 * back from a callable rather than an `onSnapshot`. `reload` is what the screen
 * offers instead — an admin is usually looking at this a moment before doing
 * something, and a refresh button is more honest than a poll that hides how
 * stale the answer is.
 *
 * `enabled` is false for anyone who isn't an app admin, and on a game the bell
 * itself is hidden from: the function would reject the first and has nothing
 * useful to say about the second, and firing a call that is certain to fail
 * just to render nothing puts a permission error in the console.
 */
export const useGameWatchers = (seasonId: string | null, gameId: string | null, enabled: boolean) => {
	const active = enabled && !!seasonId && !!gameId;

	const [uids, setUids] = useState<string[]>([]);
	const [loading, setLoading] = useState(active);
	const [error, setError] = useState<Error | null>(null);

	const reload = useCallback(async () => {
		if (!seasonId || !gameId || !enabled) return;

		setLoading(true);

		try {
			setUids(await getGameWatchers(seasonId, gameId));
			setError(null);
		} catch (caught) {
			console.error('Could not load who is following this game', caught);
			setError(caught instanceof Error ? caught : new Error('Could not load who is following this game'));
			void captureError(caught, { stage: 'getGameWatchers' });
		} finally {
			setLoading(false);
		}
	}, [seasonId, gameId, enabled]);

	useEffect(() => {
		if (!active) {
			// Cleared rather than left behind: the bell disappearing mid-session
			// (a game cancelled while it is open) must not leave a list on screen
			// describing notifications that will never be sent.
			setUids([]);
			setLoading(false);
			return;
		}

		void reload();
	}, [active, reload]);

	return { uids, loading, error, reload };
};
