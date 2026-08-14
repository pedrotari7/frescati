'use client';

import { useNotificationRoute } from '../hooks/useNotificationRoute';
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
 *
 * The other half of the worker's conversation with the page lives here too: a
 * notification tap that reuses this window arrives as a message rather than as
 * a navigation. It is mounted at the root because a notification can point at
 * any screen, and the listener has to already exist when the tap lands.
 */
const ServiceWorkerRegistrar = () => {
	const { updateReady, applyUpdate } = useServiceWorkerUpdate();

	useNotificationRoute();

	return updateReady ? <UpdatePrompt onReload={applyUpdate} /> : null;
};

export default ServiceWorkerRegistrar;
