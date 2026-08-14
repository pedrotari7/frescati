/**
 * The service worker's fetch routing.
 *
 * `public/sw.js` is a plain script rather than a module — it has to be, the
 * browser loads it by URL — so there is nothing to import. This reads the real
 * file and runs it with `self`, `caches`, `fetch` and `Response` shadowed by
 * fakes, capturing the listeners it registers. That keeps the test honest: it
 * exercises the file that actually ships, not a copy of its logic.
 *
 * The test lives here rather than beside it because anything in `public/` is
 * served, and a test file on a public URL is nobody's idea of a good time.
 *
 * What is worth covering is which strategy each kind of request gets. Getting
 * that wrong is invisible in development — where every deploy is a fresh cache
 * — and shows up weeks later as a phone that has quietly stopped updating.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ORIGIN = 'https://frescati.test';

class FakeResponse {
	constructor(
		readonly url: string,
		readonly ok: boolean = true,
		readonly label: string = 'network'
	) {}

	clone(): FakeResponse {
		return new FakeResponse(this.url, this.ok, this.label);
	}

	static error(): FakeResponse {
		return new FakeResponse('', false, 'error');
	}
}

interface FakeRequest {
	url: string;
	method: string;
	mode: string;
}

const aRequest = (path: string, { method = 'GET', mode = 'cors' } = {}): FakeRequest => ({
	url: `${ORIGIN}${path}`,
	method,
	mode,
});

/** Cache keyed by URL, which is all the worker's usage distinguishes. */
const createCaches = () => {
	const stores = new Map<string, Map<string, FakeResponse>>();

	const keyOf = (request: FakeRequest | string) =>
		typeof request === 'string' ? `${ORIGIN}${request}` : request.url;

	return {
		stores,
		api: {
			// Registers the name eagerly, like the real CacheStorage: opening a
			// cache creates it, and `keys()` lists it whether or not anything
			// has been put in it yet.
			open: async (name: string) => {
				const store = stores.get(name) ?? new Map<string, FakeResponse>();
				stores.set(name, store);

				return {
					put: async (request: FakeRequest | string, response: FakeResponse) => {
						store.set(keyOf(request), response);
					},
				};
			},
			match: async (request: FakeRequest | string) => {
				for (const store of stores.values()) {
					const hit = store.get(keyOf(request));
					if (hit) return hit;
				}

				return undefined;
			},
			keys: async () => [...stores.keys()],
			delete: async (name: string) => stores.delete(name),
		},
	};
};

/**
 * The channel the worker hands a page to answer on. Jest's jsdom provides no
 * `MessageChannel`, and the worker asks little enough of one — two ports and
 * delivery that isn't synchronous — that standing it up here is cheaper than
 * bringing in Node's, whose ports hold the event loop open.
 */
class FakePort {
	onmessage: ((event: { data: unknown }) => void) | null = null;
	other: FakePort | null = null;

	postMessage(data: unknown) {
		queueMicrotask(() => this.other?.onmessage?.({ data }));
	}
}

class FakeMessageChannel {
	readonly port1 = new FakePort();
	readonly port2 = new FakePort();

	constructor() {
		this.port1.other = this.port2;
		this.port2.other = this.port1;
	}
}

/**
 * A window the worker can reach, standing in for a running copy of the app.
 *
 * `answers` is the whole point: a page on the current bundle replies on the
 * port it is handed, and one that doesn't is how an old bundle, or a page whose
 * JS has died, looks from in here.
 */
class FakeClient {
	readonly focus = jest.fn(async () => this);
	readonly navigate = jest.fn(async (url: string) => {
		this.url = url;
		return this;
	});

	readonly posted: { type: string; url: string }[] = [];

	constructor(
		public url = `${ORIGIN}/`,
		private readonly answers = true
	) {}

	postMessage(message: { type: string; url: string }, transfer: FakePort[] = []) {
		this.posted.push(message);
		if (this.answers) transfer[0]?.postMessage({ type: 'NAVIGATING' });
	}
}

interface Harness {
	fetchListener: (event: unknown) => void;
	activateListener: (event: unknown) => void;
	caches: ReturnType<typeof createCaches>;
	fetchMock: jest.Mock;
	openWindow: jest.Mock;
	/** Runs the fetch handler and returns what it answered, or `null`. */
	handle: (request: FakeRequest) => Promise<FakeResponse | null>;
	/** Runs the notificationclick handler to completion. */
	tap: (options?: { url?: string; action?: string }) => Promise<void>;
}

const load = ({ clients = [] as FakeClient[] } = {}): Harness => {
	const source = readFileSync(join(__dirname, '..', 'public', 'sw.js'), 'utf8');
	const listeners = new Map<string, (event: unknown) => void>();
	const caches = createCaches();

	const fetchMock = jest.fn(async (request: FakeRequest) => new FakeResponse(request.url));
	const openWindow = jest.fn(async () => undefined);

	const self = {
		addEventListener: (type: string, handler: (event: unknown) => void) => listeners.set(type, handler),
		location: new URL(ORIGIN),
		skipWaiting: () => undefined,
		clients: { claim: () => undefined, matchAll: async () => clients, openWindow },
	};

	// Shadowing the globals by parameter name is what lets the real file run
	// unmodified — it reaches for these bare, exactly as it does in a browser.
	new Function('self', 'caches', 'fetch', 'Response', 'MessageChannel', source)(
		self,
		caches.api,
		fetchMock,
		FakeResponse,
		FakeMessageChannel
	);

	const fetchListener = listeners.get('fetch')!;
	const clickListener = listeners.get('notificationclick')!;

	return {
		fetchListener,
		activateListener: listeners.get('activate')!,
		caches,
		fetchMock,
		openWindow,
		handle: async request => {
			let answered: Promise<FakeResponse> | null = null;

			fetchListener({ request, respondWith: (value: Promise<FakeResponse>) => (answered = value) });

			return answered === null ? null : await answered;
		},
		tap: async ({ url = '/s/season-1/g/game-1', action = '' } = {}) => {
			let settled: Promise<unknown> = Promise.resolve();

			clickListener({
				action,
				notification: { close: () => undefined, data: { url } },
				waitUntil: (value: Promise<unknown>) => (settled = value),
			});

			await settled;
		},
	};
};

describe('the service worker', () => {
	it('leaves cross-origin traffic alone, so Firestore and auth go straight out', async () => {
		const worker = load();

		const answered = await worker.handle({
			url: 'https://firestore.googleapis.com/v1/projects/x',
			method: 'GET',
			mode: 'cors',
		});

		expect(answered).toBeNull();
	});

	it('leaves anything that is not a GET alone', async () => {
		const worker = load();

		expect(await worker.handle(aRequest('/api/csp-report', { method: 'POST' }))).toBeNull();
	});

	describe('content-hashed build output', () => {
		it('serves a cached chunk without going to the network', async () => {
			const worker = load();
			const chunk = aRequest('/_next/static/chunks/abc123.js');

			await worker.handle(chunk);
			expect(worker.fetchMock).toHaveBeenCalledTimes(1);

			await worker.handle(chunk);
			expect(worker.fetchMock).toHaveBeenCalledTimes(1);
		});

		// A 404 or 502 caught mid-deploy, cached forever, wedges that browser on
		// a chunk that never loads until CACHE_VERSION moves.
		it('never caches an error response', async () => {
			const worker = load();
			worker.fetchMock.mockResolvedValueOnce(new FakeResponse(`${ORIGIN}/_next/static/x.js`, false));

			await worker.handle(aRequest('/_next/static/x.js'));
			await worker.handle(aRequest('/_next/static/x.js'));

			expect(worker.fetchMock).toHaveBeenCalledTimes(2);
		});

		it('treats icons and the manifest as immutable too', async () => {
			const worker = load();

			for (const path of ['/icon-192.png', '/manifest.json', '/icon.svg']) {
				await worker.handle(aRequest(path));
				await worker.handle(aRequest(path));
			}

			expect(worker.fetchMock).toHaveBeenCalledTimes(3);
		});
	});

	/**
	 * The regression this file exists for. These are the requests every in-app
	 * navigation makes, and their content changes with every deploy while their
	 * URL does not — so cache-first left a returning phone answering out of the
	 * build it first loaded, forever.
	 */
	describe('RSC payloads', () => {
		const rsc = aRequest('/s/season-1/g/game-1?_rsc=1a2b3c');

		it('goes to the network even when a copy is already cached', async () => {
			const worker = load();

			await worker.handle(rsc);
			expect(worker.fetchMock).toHaveBeenCalledTimes(1);

			worker.fetchMock.mockResolvedValueOnce(new FakeResponse(rsc.url, true, 'fresh'));
			const second = await worker.handle(rsc);

			expect(worker.fetchMock).toHaveBeenCalledTimes(2);
			expect(second?.label).toBe('fresh');
		});

		it('falls back to the cached copy when the network is gone', async () => {
			const worker = load();

			await worker.handle(rsc);

			worker.fetchMock.mockRejectedValueOnce(new Error('offline'));
			const offline = await worker.handle(rsc);

			expect(offline?.label).toBe('network');
		});

		// `respondWith(undefined)` is a TypeError the page cannot handle, which
		// is what nothing-cached-and-offline used to produce.
		it('answers with an error response when there is nothing cached and no network', async () => {
			const worker = load();
			worker.fetchMock.mockRejectedValueOnce(new Error('offline'));

			const answered = await worker.handle(aRequest('/s/never-seen?_rsc=zzz'));

			expect(answered).not.toBeUndefined();
			expect(answered?.ok).toBe(false);
		});
	});

	describe('navigations', () => {
		const page = aRequest('/s/season-1', { mode: 'navigate' });

		it('prefers the network so an open app is never a build behind', async () => {
			const worker = load();

			await worker.handle(page);
			worker.fetchMock.mockResolvedValueOnce(new FakeResponse(page.url, true, 'fresh'));

			expect((await worker.handle(page))?.label).toBe('fresh');
		});

		it('falls back to the offline page when there is nothing cached', async () => {
			const worker = load();
			await worker.caches.api.open('frescati-static-v2').then(cache =>
				// What `install` puts there.
				cache.put('/offline.html', new FakeResponse(`${ORIGIN}/offline.html`, true, 'offline-page'))
			);

			worker.fetchMock.mockRejectedValueOnce(new Error('offline'));

			expect((await worker.handle(aRequest('/never-visited', { mode: 'navigate' })))?.label).toBe('offline-page');
		});
	});

	/**
	 * What happens to the window a notification tap lands on.
	 *
	 * The regression here is invisible in a test and unmistakable on a phone: a
	 * navigation started before the app was brought to the front left iOS
	 * resolving `position: fixed` against the viewport the web view had while it
	 * was backgrounded, so the top bar and tab bar scrolled off with the page.
	 * Ordering focus ahead of anything else is the fix, and a route change in
	 * the running page avoids the load — and the layout — altogether.
	 */
	describe('a notification tap', () => {
		it('opens a window when there is none to reuse', async () => {
			const worker = load();

			await worker.tap({ url: '/s/season-1/g/game-1' });

			expect(worker.openWindow).toHaveBeenCalledWith('/s/season-1/g/game-1');
		});

		it('carries the "I\'m in" intent in the URL, since the worker cannot write it', async () => {
			const worker = load();

			await worker.tap({ url: '/s/season-1/g/game-1', action: 'in' });

			expect(worker.openWindow).toHaveBeenCalledWith('/s/season-1/g/game-1?respond=in');
		});

		it('appends the intent to a URL that already carries a query', async () => {
			const worker = load();

			await worker.tap({ url: '/s/season-1/g/game-1?from=push', action: 'in' });

			expect(worker.openWindow).toHaveBeenCalledWith('/s/season-1/g/game-1?from=push&respond=in');
		});

		it('hands the route to a window that is already open, without loading a page into it', async () => {
			const open = new FakeClient();
			const worker = load({ clients: [open] });

			await worker.tap({ url: '/s/season-1/g/game-1' });

			expect(open.posted).toEqual([{ type: 'NAVIGATE', url: '/s/season-1/g/game-1' }]);
			expect(open.navigate).not.toHaveBeenCalled();
			expect(worker.openWindow).not.toHaveBeenCalled();
		});

		// The bug this describe block exists for. Focusing second meant iOS laid
		// the new page out while the web view was still off screen.
		it('focuses before it does anything else with the window', async () => {
			const stale = new FakeClient(`${ORIGIN}/`, false);
			const worker = load({ clients: [stale] });

			await worker.tap({ url: '/s/season-1/g/game-1' });

			expect(stale.focus).toHaveBeenCalled();
			expect(stale.focus.mock.invocationCallOrder[0]).toBeLessThan(stale.navigate.mock.invocationCallOrder[0]);
		});

		// An older bundle has no listener, and a page whose JS has died cannot
		// answer either. Both are better off reloaded than left where they were.
		it('falls back to a real navigation when the page does not answer', async () => {
			const stale = new FakeClient(`${ORIGIN}/`, false);
			const worker = load({ clients: [stale] });

			await worker.tap({ url: '/s/season-1/g/game-1' });

			expect(stale.navigate).toHaveBeenCalledWith('/s/season-1/g/game-1');
		});

		// `navigate()` rejects on a window opened before this worker activated.
		// Focused and where it was beats an unhandled rejection.
		it('survives a window it does not control refusing to navigate', async () => {
			const uncontrolled = new FakeClient(`${ORIGIN}/`, false);
			uncontrolled.navigate.mockRejectedValue(new TypeError('not controlled'));

			const worker = load({ clients: [uncontrolled] });

			await expect(worker.tap()).resolves.toBeUndefined();
			expect(uncontrolled.focus).toHaveBeenCalled();
		});
	});

	// A strategy fix ships to nobody if the entries it was meant to correct are
	// still being served, which is what the version in the cache names is for.
	it('drops caches from an older version on activate', async () => {
		const worker = load();

		await worker.caches.api.open('frescati-runtime-v1');
		await worker.caches.api.open('frescati-runtime-v2');

		let settled: Promise<unknown> = Promise.resolve();
		worker.activateListener({ waitUntil: (value: Promise<unknown>) => (settled = value) });
		await settled;

		expect([...worker.caches.stores.keys()]).toEqual(['frescati-runtime-v2']);
	});
});
