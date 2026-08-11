'use client';

import { useEffect } from 'react';
import { captureError } from '../lib/sentry';

/**
 * Registers the service worker that backs both offline caching and push.
 *
 * Kept out of the push module on purpose: registration must happen for every
 * visitor so the app works offline, whereas asking for notification permission
 * is a deliberate, user-triggered step.
 */
const ServiceWorkerRegistrar = () => {
	useEffect(() => {
		if (!('serviceWorker' in navigator)) return;

		navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(error => {
			// Nothing else observes this. A failed registration means no offline
			// fallback and no push for this visitor, silently — worth knowing
			// about even though there's nothing to tell them on screen.
			console.error('Service worker registration failed', error);
			void captureError(error, { stage: 'serviceWorkerRegister' });
		});
	}, []);

	return null;
};

export default ServiceWorkerRegistrar;
