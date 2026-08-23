'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { captureError } from '../lib/sentry';

/**
 * Registers the service worker, and notices when a newer one is ready.
 *
 * Registration and update detection are the same object: you cannot watch for
 * an update without the `ServiceWorkerRegistration` that registering hands
 * back, so they live together here rather than in two places passing one
 * around.
 *
 * The worker no longer calls `skipWaiting()`, so a new build installs and then
 * sits in `waiting` until asked. That is the point: activating would delete the
 * previous version's caches under a page still running it. What is left to do
 * is tell somebody, and reload when they say yes.
 *
 * Nothing here forces the issue. A prompt that reloaded on its own would throw
 * away whatever was half-typed on screen to fix a problem the person has not
 * hit yet.
 */
export const useServiceWorkerUpdate = () => {
	const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
	const registration = useRef<ServiceWorkerRegistration | null>(null);

	useEffect(() => {
		if (!('serviceWorker' in navigator)) return;

		/**
		 * Whether this page is already under a worker's control.
		 *
		 * Load-bearing. `controllerchange` fires on a *first* install too, when
		 * the brand-new worker claims a page that had none, and reloading there
		 * would mean every first visit to the app silently refreshed itself.
		 * Only a page that had a controller and then got a different one has
		 * been handed over to a new build.
		 */
		const hadController = Boolean(navigator.serviceWorker.controller);
		let reloading = false;
		let cancelled = false;

		const onControllerChange = () => {
			// Guarded because the event can fire more than once, and a second
			// reload mid-reload is how a page ends up in a loop.
			if (!hadController || reloading) return;

			reloading = true;
			window.location.reload();
		};

		navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

		// `installed` with a controller already present means an update finished
		// downloading and is now queued behind the running one. The same state
		// without a controller is a first install, which has nothing to replace.
		const offer = (worker: ServiceWorker | null) => {
			if (cancelled || !worker || !hadController) return;
			if (worker.state === 'installed') setWaiting(worker);
		};

		navigator.serviceWorker
			.register('/sw.js', { scope: '/' })
			.then(current => {
				if (cancelled) return;

				registration.current = current;

				// Already finished waiting before this page even loaded. The
				// common case for a phone that was closed during a deploy.
				offer(current.waiting);

				current.addEventListener('updatefound', () => {
					const installing = current.installing;
					if (!installing) return;

					installing.addEventListener('statechange', () => offer(installing));
				});
			})
			.catch(error => {
				// Nothing else observes this. A failed registration means no
				// offline fallback and no push for this visitor, silently.
				// Worth knowing about even though there's nothing to say on
				// screen.
				console.error('Service worker registration failed', error);
				void captureError(error, { stage: 'serviceWorkerRegister' });
			});

		return () => {
			cancelled = true;
			navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
		};
	}, []);

	/**
	 * Ask the browser whether a new worker exists, every time the app comes back
	 * to the foreground.
	 *
	 * Browsers check on navigation, and an installed PWA barely navigates, it
	 * is opened, used and backgrounded, sometimes for weeks, inside one document
	 * that never asks for `/sw.js` again. Without this the update prompt would
	 * mostly reach the people who least need it.
	 */
	useEffect(() => {
		const check = () => {
			if (document.visibilityState !== 'visible') return;

			// A failed check is a phone with no signal, which is the normal
			// state of this app at a pitch. The next return to the foreground
			// asks again.
			registration.current?.update().catch(() => undefined);
		};

		document.addEventListener('visibilitychange', check);

		return () => document.removeEventListener('visibilitychange', check);
	}, []);

	/**
	 * Take the update. The worker answers by activating, which fires
	 * `controllerchange` above and reloads the page onto the new build, so
	 * there is deliberately no `location.reload()` here. Reloading before the
	 * handover completed would just load the old bundle again.
	 */
	const applyUpdate = useCallback(() => {
		waiting?.postMessage({ type: 'SKIP_WAITING' });
	}, [waiting]);

	return { updateReady: waiting !== null, applyUpdate };
};
