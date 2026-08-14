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
 *
 * A new worker **waits** rather than taking over on its own. `install` used to
 * end in `skipWaiting()`, which meant a deploy landing mid-session activated
 * underneath whoever was using the app — and `activate` immediately deletes
 * every cache from the previous version. The page carried on running the old
 * build with the old build's chunks no longer cached and, once Vercel had aged
 * them out, no longer fetchable either: the missing-module crash the error
 * boundary now reloads out of. Waiting keeps the old build intact until the
 * person agrees to a reload, which `useServiceWorkerUpdate` asks for and
 * `SKIP_WAITING` below carries out.
 *
 * CACHE_VERSION stays at v2 for that change: nothing about what is stored or
 * how it is matched moved, so aging out everybody's cache would cost a round of
 * cold loads to correct entries that were never wrong.
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
	);
	// Note the absence of `skipWaiting()` — see the header. A first install has
	// nothing to wait behind and activates immediately anyway, so this only
	// changes what happens to somebody already using the app.
});

/**
 * The page asking to be handed over to.
 *
 * The only way out of `waiting`, now that installing no longer forces it. The
 * page posts this after the person taps the update prompt and reloads itself
 * on `controllerchange`; nothing else sends it, so a deploy can never take a
 * bundle out from under somebody mid-tap.
 */
self.addEventListener('message', event => {
	if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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

/**
 * How long to give a page to say it took the route change itself.
 *
 * Short, because guessing wrong costs only the full navigation this was trying
 * to avoid — whereas not waiting at all would mean a tap that opens the app and
 * then sits on whatever screen it was left on.
 */
const ROUTE_ACK_MS = 500;

/**
 * Hand a URL to a window that is already open, without loading a page into it.
 *
 * Resolves true once the page has answered on the port, false if nothing does
 * in time: a bundle too old to listen, or one whose JS has died. Both of those
 * want the real navigation instead.
 */
const routeInPage = (client, url) =>
	new Promise(resolve => {
		const channel = new MessageChannel();
		const timer = setTimeout(() => resolve(false), ROUTE_ACK_MS);

		channel.port1.onmessage = () => {
			clearTimeout(timer);
			resolve(true);
		};

		client.postMessage({ type: 'NAVIGATE', url }, [channel.port2]);
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
		(async () => {
			const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

			// Focus an existing window if there is one; opening a second copy of
			// an installed PWA is disorienting.
			const existing = clientList.find(client => 'focus' in client);

			if (!existing) {
				await self.clients.openWindow(target);
				return;
			}

			// Focus *before* pointing it anywhere.
			//
			// This used to start the navigation first and focus second. On iOS
			// that meant loading a page into a web view the system had not yet
			// brought to the front, and the layout it settled on was measured
			// against the viewport that view had while it was off screen. Nothing
			// remeasures once the app is presented — no resize is reported — so
			// `position: fixed` carried on resolving against a rectangle that was
			// no longer the viewport, and the top bar and tab bar scrolled away
			// with the content instead of staying put.
			//
			// It needed a window to have survived in the background to reuse,
			// which is why it happened on some notification taps and not others.
			//
			// A browser that refuses to focus — no user activation it recognises —
			// leaves the window unfocused rather than leaving the tap unanswered.
			const focused = (await existing.focus().catch(() => null)) || existing;

			// Better still, don't load a page at all. A route change inside the
			// running app cannot be laid out against the wrong viewport because it
			// is not laid out again — and it skips a network-first navigation on a
			// phone that, given where this app gets opened, may have no signal.
			if (await routeInPage(focused, target)) return;

			// `navigate()` rejects on a window this worker does not control, which
			// is every window opened before it first activated. Focused and still
			// on the screen it was left on is a worse answer than focused and
			// where it was asked for, but it is a long way from nothing.
			await focused.navigate(target).catch(() => undefined);
		})()
	);
});
