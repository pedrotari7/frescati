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
 */
export const useNow = (intervalMs: number = DEFAULT_INTERVAL_MS): Date => {
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const tick = () => setNow(new Date());

		const handle = setInterval(tick, intervalMs);
		const onVisible = () => document.visibilityState === 'visible' && tick();

		document.addEventListener('visibilitychange', onVisible);

		return () => {
			clearInterval(handle);
			document.removeEventListener('visibilitychange', onVisible);
		};
	}, [intervalMs]);

	return now;
};
