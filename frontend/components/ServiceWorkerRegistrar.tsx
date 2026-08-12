'use client';

import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate';
import UpdatePrompt from './UpdatePrompt';

/**
 * Registers the service worker that backs both offline caching and push, and
 * offers the new build once one is waiting.
 *
 * Kept out of the push module on purpose: registration must happen for every
 * visitor so the app works offline, whereas asking for notification permission
 * is a deliberate, user-triggered step.
 *
 * It renders now, where it used to render nothing. The prompt belongs to the
 * registration — only the object returned by `register` knows an update exists
 * — and putting it anywhere else would mean threading that state up through the
 * root layout to a sibling.
 */
const ServiceWorkerRegistrar = () => {
	const { updateReady, applyUpdate } = useServiceWorkerUpdate();

	return updateReady ? <UpdatePrompt onReload={applyUpdate} /> : null;
};

export default ServiceWorkerRegistrar;
