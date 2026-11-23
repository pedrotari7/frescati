'use client';

import { useEffect, useRef } from 'react';

/**
 * Whether this is the first time this session `key` has been claimed for
 * `value`, recording it if so.
 *
 * `sessionStorage` throws outright where storage is blocked, which on Safari in
 * private mode is a phone this app really runs on. Being unable to record a
 * jump means not taking it: the screen it would have left is a perfectly good
 * place to stay, and an unrecorded redirect is one the back button can't escape.
 */
export const claimOnce = (key: string, value: string): boolean => {
	try {
		if (window.sessionStorage.getItem(key) === value) return false;

		window.sessionStorage.setItem(key, value);
		return true;
	} catch {
		return false;
	}
};

/**
 * Runs `arrive` when somebody comes to the screen: the first render where
 * `ready` holds, and every return of the app to the foreground after that.
 *
 * **Only on arrival**, which is the load *or* a return to the foreground, the
 * same exhaustive pair `useLastSeen` splits a visit into, and for the same
 * reason: an installed app is resumed far more often than it is launched, so
 * mount alone would miss the person opening it again.
 *
 * The load is latched on a ref rather than left to a dependency array, which
 * would make "arrived" mean "nothing in this list changed". A router that
 * handed back a fresh object per render would turn every re-render into
 * another arrival. `arrive` should read what it needs through a ref for the
 * same reason, so the foreground listener can be registered once.
 */
export const useOnArrival = (ready: boolean, arrive: () => void) => {
	const arrived = useRef(false);

	useEffect(() => {
		if (!ready || arrived.current) return;

		// Set before the attempt, not after: a page that loaded in the background
		// has had its load arrival, and the trip to the foreground is the one
		// that should decide.
		arrived.current = true;
		arrive();
	}, [ready, arrive]);

	useEffect(() => {
		document.addEventListener('visibilitychange', arrive);

		return () => document.removeEventListener('visibilitychange', arrive);
	}, [arrive]);
};
