'use client';

import { useEffect } from 'react';

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

		navigator.serviceWorker
			.register('/sw.js', { scope: '/' })
			.catch(error => console.error('Service worker registration failed', error));
	}, []);

	return null;
};

export default ServiceWorkerRegistrar;
