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
 * Bump CACHE_VERSION whenever the caching strategy changes, or whenever what is
 * already in somebody's cache should stop being trusted; `activate` drops every
 * cache whose name no longer matches. That second reason is the one that
 * matters — a strategy fix ships to nobody if the entries it was meant to
 * correct are still being served.
 *
 * v2: the catch-all below used to be cache-first, which pinned Next's RSC
 * payloads. A returning phone kept navigating around inside the build it first
 * loaded, indefinitely, because nothing in a deploy invalidates a service
 * worker cache.
 */

const CACHE_VERSION = 'v2';
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

/**
 * Things a deploy cannot change the meaning of.
 *
 * `/_next/static/` filenames carry a content hash, and an icon or a font at a
 * fixed path is the same bytes forever in any way that matters. Those are safe
 * to serve from cache without asking.
 *
 * Everything else same-origin — Next's RSC payloads above all — is a URL whose
 * *content* a deploy replaces while the address stays put, and cache-first on
 * those is how a phone ends up permanently inside an old build.
 */
const isImmutable = url =>
	url.pathname.startsWith('/_next/static/') ||
	url.pathname.startsWith('/fonts/') ||
	url.pathname === '/manifest.json' ||
	/\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/.test(url.pathname);

/** Store a good response and hand it on. Never caches an error page. */
const cacheIfOk = (cacheName, request, response) => {
	if (response.ok) {
		const copy = response.clone();
		caches.open(cacheName).then(cache => cache.put(request, copy));
	}

	return response;
};

self.addEventListener('fetch', event => {
	const { request } = event;

	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// Never touch cross-origin traffic — Firestore and Google auth in particular
	// must go straight to the network.
	if (url.origin !== self.location.origin) return;

	// Immutable build output: cache-first is safe and makes repeat loads instant.
	if (isImmutable(url)) {
		event.respondWith(
			caches.match(request).then(
				cached =>
					cached ||
					// Only cache a real answer. Cache-first means a 404 or a 502
					// caught mid-deploy would otherwise be served from the cache
					// forever, wedging that browser on a chunk that never loads
					// until CACHE_VERSION moves.
					fetch(request).then(response => cacheIfOk(STATIC_CACHE, request, response))
			)
		);
		return;
	}

	// Navigations: network-first so people always get fresh data when online,
	// with the offline page as the last resort.
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request)
				// An error page is not a page worth serving offline later.
				.then(response => cacheIfOk(RUNTIME_CACHE, request, response))
				.catch(() => caches.match(request).then(cached => cached || caches.match(OFFLINE_URL)))
		);
		return;
	}

	// Everything else: network-first, with whatever we have as the fallback.
	//
	// This is where Next's RSC payloads land — the request every in-app
	// navigation makes. Cache-first here meant a returning phone kept being
	// answered out of the build it first loaded: not visibly broken, just never
	// updating, and eventually dead-ending on a chunk the deploy had aged out.
	// A round trip is cheaper than that, and the browser's own HTTP cache still
	// sits behind this, so most of them never leave the device anyway.
	event.respondWith(
		fetch(request)
			.then(response => cacheIfOk(RUNTIME_CACHE, request, response))
			.catch(async () => {
				const cached = await caches.match(request);

				// `respondWith(undefined)` is a TypeError rather than something
				// the page can handle, which is what nothing-cached-and-offline
				// used to produce here.
				return cached ?? Response.error();
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
			// Only a game has something to say yes to. FCM data values are
			// strings, hence the comparison rather than a truthiness check —
			// and an older payload without the field gets no shortcut rather
			// than a broken one.
			actions:
				payload.url && payload.respondable === '1'
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
