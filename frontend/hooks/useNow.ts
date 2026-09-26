'use client';

import { useEffect, useState } from 'react';

/** Often enough that a deadline lands within the minute, rarely enough to be free. */
const DEFAULT_INTERVAL_MS = 30_000;

/**
 * A clock that actually ticks.
 *
 * Anything derived from `new Date()` during render is frozen at the moment the
 * component mounted, and nothing in this app re-renders on its own. A game left
 * open on screen therefore kept its In/Out buttons live long after the deadline
 * passed: the write would be rejected by the rules, but the UI happily invited
 * it, and "Playing now" never arrived for anyone already looking at the page.
 *
 * Also ticks when the tab comes back to the foreground: an installed PWA is
 * usually resumed rather than reopened, and timers don't fire while it's
 * backgrounded, so returning after an hour would otherwise show an hour-old
 * clock until the next interval.
 *
 * Which is also why the interval only runs while the tab is on screen. Five
 * screens call this, and a tick re-renders every one of them down to the last
 * row, re-partitioning the calendar on the way. Nobody is looking at any of
 * that in a backgrounded tab, and the foreground tick above already puts the
 * clock right the moment somebody is.
 */
export const useNow = (intervalMs: number = DEFAULT_INTERVAL_MS): Date => {
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		let handle: ReturnType<typeof setInterval> | undefined;

		const tick = () => setNow(new Date());

		const stop = () => {
			if (handle !== undefined) clearInterval(handle);
			handle = undefined;
		};

		// Restarted rather than left running, so the first tick after a return
		// to the foreground is a whole interval away rather than whatever was
		// left of the one that was running when the tab went away.
		const start = () => {
			stop();
			handle = setInterval(tick, intervalMs);
		};

		const onVisibilityChange = () => {
			if (document.visibilityState !== 'visible') {
				stop();

				return;
			}

			tick();
			start();
		};

		if (document.visibilityState === 'visible') start();

		document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			stop();
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	}, [intervalMs]);

	return now;
};
