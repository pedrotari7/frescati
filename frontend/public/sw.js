/*
 * Frescati service worker.
 *
 * Does two jobs:
 *   1. Offline caching, so opening the app on a patchy connection at the pitch
 *      still shows something.
 *   2. Web push. The backend sends DATA-ONLY FCM messages so the Firebase SDK
 *      doesn't auto-display them — that lets a single hand-written worker own
 *      both jobs instead of also shipping firebase-messaging-sw.js.
 *
 * Bump CACHE_VERSION whenever the caching strategy changes; old caches are
 * dropped on activate.
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `frescati-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `frescati-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', event => {
	event.waitUntil(
		caches
			.open(STATIC_CACHE)
			.then(cache => cache.addAll([OFFLINE_URL, '/manifest.json', '/icon-192.png']))
			// A missing asset must not wedge the whole worker.
			.catch(() => undefined)
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches
			.keys()
			.then(keys =>
				Promise.all(
					keys.filter(key => key !== STATIC_CACHE && key !== RUNTIME_CACHE).map(key => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	);
});

const isStaticAsset = url => url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/');

self.addEventListener('fetch', event => {
	const { request } = event;

	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// Never touch cross-origin traffic — Firestore and Google auth in particular
	// must go straight to the network.
	if (url.origin !== self.location.origin) return;

	// Immutable build output: cache-first is safe and makes repeat loads instant.
	if (isStaticAsset(url)) {
		event.respondWith(
			caches.match(request).then(
				cached =>
					cached ||
					fetch(request).then(response => {
						// Only cache a real answer. Cache-first means a 404 or a
						// 502 caught mid-deploy would otherwise be served from
						// the cache forever, wedging that browser on a chunk
						// that never loads until CACHE_VERSION moves.
						if (response.ok) {
							const copy = response.clone();
							caches.open(STATIC_CACHE).then(cache => cache.put(request, copy));
						}
						return response;
					})
			)
		);
		return;
	}

	// Navigations: network-first so people always get fresh data when online,
	// with the offline page as the last resort.
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request)
				.then(response => {
					// An error page is not a page worth serving offline later.
					if (response.ok) {
						const copy = response.clone();
						caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
					}
					return response;
				})
				.catch(() => caches.match(request).then(cached => cached || caches.match(OFFLINE_URL)))
		);
		return;
	}

	// Everything else: serve what we have, refresh it in the background.
	event.respondWith(
		caches.match(request).then(cached => {
			const network = fetch(request)
				.then(response => {
					if (response.ok) {
						const copy = response.clone();
						caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
					}
					return response;
				})
				.catch(() => cached);

			return cached || network;
		})
	);
});

self.addEventListener('push', event => {
	if (!event.data) return;

	let payload = {};
	try {
		const raw = event.data.json();
		// FCM data-only messages arrive under `data`; tolerate a flat body too.
		payload = raw.data || raw;
	} catch {
		payload = { title: 'Frescati', body: event.data.text() };
	}

	const title = payload.title || 'Frescati';

	event.waitUntil(
		self.registration.showNotification(title, {
			body: payload.body || '',
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			// Same tag replaces an earlier notification for the same game rather
			// than stacking three reminders about one Tuesday.
			tag: payload.tag || 'frescati',
			renotify: Boolean(payload.renotify),
			data: { url: payload.url || '/' },
			actions: payload.url
				? [
						{ action: 'in', title: "I'm in" },
						{ action: 'open', title: 'Open' },
					]
				: [],
		})
	);
});

self.addEventListener('notificationclick', event => {
	event.notification.close();

	const base = event.notification.data?.url || '/';

	// A worker has no Firebase auth token, so it can't write the response
	// itself. Carry the intent in the URL instead and let the app — which is
	// signed in — perform the write as it opens. The button was previously
	// advertised on every notification and did nothing but open the app.
	const target = event.action === 'in' ? `${base}${base.includes('?') ? '&' : '?'}respond=in` : base;

	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
			// Focus an existing tab if there is one; opening a second copy of an
			// installed PWA is disorienting.
			for (const client of clientList) {
				if ('focus' in client) {
					client.navigate(target);
					return client.focus();
				}
			}

			return self.clients.openWindow(target);
		})
	);
});
