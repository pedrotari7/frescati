'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Follows the service worker's "go here" after a notification tap.
 *
 * The worker used to point the surviving window at the URL itself with
 * `client.navigate()`. That is a full page load, and on iOS it was being
 * started before the app had been brought to the front, so the page was laid
 * out against the viewport the web view had while it was backgrounded, and
 * nothing remeasures afterwards. What that looked like was a top bar and a tab
 * bar pinned to a rectangle that scrolls away with the content.
 *
 * Changing route in the page that is already running avoids the load entirely.
 * The worker still falls back to `navigate()` when nothing answers, so a window
 * on an older bundle, or one whose JS has died, is no worse off than before.
 */
export const useNotificationRoute = () => {
	const router = useRouter();

	useEffect(() => {
		if (!('serviceWorker' in navigator)) return;

		const onMessage = (event: MessageEvent) => {
			if (event.data?.type !== 'NAVIGATE' || typeof event.data.url !== 'string') return;

			// Only our own worker can send this and it only ever sends a path,
			// but resolving it and checking costs nothing next to following an
			// address off the origin because something upstream went wrong.
			const target = new URL(event.data.url, window.location.origin);
			if (target.origin !== window.location.origin) return;

			// Answered before the route change rather than after: this is the
			// point at which the page has taken the navigation on. Waiting for
			// the router would leave the worker's fallback racing it.
			event.ports[0]?.postMessage({ type: 'NAVIGATING' });

			if (target.href === window.location.href) return;

			// `router.push` to the path we are already on re-renders without
			// remounting, and `?respond=in` is read once on mount, so tapping
			// "I'm in" while already looking at that game would quietly do
			// nothing. A load is the right answer here in a way it is not from
			// the worker: this window is focused, on screen and measured.
			if (target.pathname === window.location.pathname) window.location.replace(target.href);
			else router.push(`${target.pathname}${target.search}`);
		};

		navigator.serviceWorker.addEventListener('message', onMessage);

		// Load-bearing. `addEventListener` leaves the worker's messages queued
		// where assigning `onmessage` would have started delivery; without this
		// the notification tap is answered by nobody and falls back every time.
		navigator.serviceWorker.startMessages();

		return () => navigator.serviceWorker.removeEventListener('message', onMessage);
	}, [router]);
};
