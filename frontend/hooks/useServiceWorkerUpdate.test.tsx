import { act, renderHook, waitFor } from '@testing-library/react';

jest.mock('../lib/sentry', () => ({ captureError: jest.fn().mockResolvedValue(undefined) }));

import { useServiceWorkerUpdate } from './useServiceWorkerUpdate';

/**
 * jsdom has no `navigator.serviceWorker` at all, so the whole container is
 * stood up here. What is worth covering is the handover: when the prompt is
 * offered, and, the one that matters, when the page is allowed to reload
 * itself, because getting that wrong turns every first visit into a refresh
 * loop.
 */

type Listener = (event?: unknown) => void;

class FakeWorker {
	state = 'installing';
	readonly posted: unknown[] = [];
	private readonly listeners = new Map<string, Listener[]>();

	addEventListener(type: string, listener: Listener) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	postMessage(message: unknown) {
		this.posted.push(message);
	}

	/** Finish installing, which is what puts a worker into `waiting`. */
	installed() {
		this.state = 'installed';
		for (const listener of this.listeners.get('statechange') ?? []) listener();
	}
}

class FakeRegistration {
	waiting: FakeWorker | null = null;
	installing: FakeWorker | null = null;
	readonly update = jest.fn().mockResolvedValue(undefined);
	private readonly listeners = new Map<string, Listener[]>();

	addEventListener(type: string, listener: Listener) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	/** A new worker starts downloading behind the running one. */
	findUpdate(worker: FakeWorker) {
		this.installing = worker;
		for (const listener of this.listeners.get('updatefound') ?? []) listener();
	}
}

let registration: FakeRegistration;
let container: {
	controller: unknown;
	register: jest.Mock;
	addEventListener: jest.Mock;
	removeEventListener: jest.Mock;
};
let controllerChange: Listener | undefined;
let reload: jest.Mock;

const install = ({ controlled }: { controlled: boolean }) => {
	registration = new FakeRegistration();
	controllerChange = undefined;

	container = {
		controller: controlled ? {} : null,
		register: jest.fn().mockResolvedValue(registration),
		addEventListener: jest.fn((type: string, listener: Listener) => {
			if (type === 'controllerchange') controllerChange = listener;
		}),
		removeEventListener: jest.fn(),
	};

	Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
};

beforeEach(() => {
	reload = jest.fn();
	Object.defineProperty(window, 'location', { value: { reload }, configurable: true, writable: true });
	Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('useServiceWorkerUpdate', () => {
	it('registers the worker', async () => {
		install({ controlled: true });

		renderHook(() => useServiceWorkerUpdate());

		await waitFor(() => expect(container.register).toHaveBeenCalledWith('/sw.js', { scope: '/' }));
	});

	it('offers an update that finished installing behind the running build', async () => {
		install({ controlled: true });
		const { result } = renderHook(() => useServiceWorkerUpdate());

		await waitFor(() => expect(container.register).toHaveBeenCalled());

		const incoming = new FakeWorker();
		act(() => registration.findUpdate(incoming));
		expect(result.current.updateReady).toBe(false);

		act(() => incoming.installed());

		await waitFor(() => expect(result.current.updateReady).toBe(true));
	});

	// A phone that was closed during a deploy comes back with the new worker
	// already parked, and no `updatefound` will ever fire for it.
	it('offers a worker that was already waiting when the page loaded', async () => {
		install({ controlled: true });
		const parked = new FakeWorker();
		parked.state = 'installed';
		registration.waiting = parked;

		const { result } = renderHook(() => useServiceWorkerUpdate());

		await waitFor(() => expect(result.current.updateReady).toBe(true));
	});

	// The first visit to the app: a worker installs, claims the page and fires
	// `controllerchange`. Prompting there would offer an update to somebody who
	// just arrived, and reloading would refresh every first visit.
	it('says nothing on a first install, and does not reload', async () => {
		install({ controlled: false });
		const { result } = renderHook(() => useServiceWorkerUpdate());

		await waitFor(() => expect(container.register).toHaveBeenCalled());

		const first = new FakeWorker();
		act(() => registration.findUpdate(first));
		act(() => first.installed());
		act(() => controllerChange?.());

		expect(result.current.updateReady).toBe(false);
		expect(reload).not.toHaveBeenCalled();
	});

	it('hands over and reloads once the new worker takes control', async () => {
		install({ controlled: true });
		const { result } = renderHook(() => useServiceWorkerUpdate());

		await waitFor(() => expect(container.register).toHaveBeenCalled());

		const incoming = new FakeWorker();
		act(() => registration.findUpdate(incoming));
		act(() => incoming.installed());
		await waitFor(() => expect(result.current.updateReady).toBe(true));

		act(() => result.current.applyUpdate());
		expect(incoming.posted).toEqual([{ type: 'SKIP_WAITING' }]);
		// Nothing reloads until the worker actually activates.
		expect(reload).not.toHaveBeenCalled();

		act(() => controllerChange?.());
		expect(reload).toHaveBeenCalledTimes(1);
	});

	// The event can fire more than once; a second reload mid-reload is a loop.
	it('reloads only once however often control changes', async () => {
		install({ controlled: true });
		renderHook(() => useServiceWorkerUpdate());

		await waitFor(() => expect(container.register).toHaveBeenCalled());

		act(() => controllerChange?.());
		act(() => controllerChange?.());
		act(() => controllerChange?.());

		expect(reload).toHaveBeenCalledTimes(1);
	});

	// An installed PWA can go weeks inside one document without ever asking for
	// /sw.js again, so returning to the foreground is what triggers the check.
	it('checks for a new worker when the app comes back to the foreground', async () => {
		install({ controlled: true });
		renderHook(() => useServiceWorkerUpdate());

		await waitFor(() => expect(container.register).toHaveBeenCalled());

		act(() => {
			document.dispatchEvent(new Event('visibilitychange'));
		});

		expect(registration.update).toHaveBeenCalled();
	});

	it('does not check while the app is in the background', async () => {
		install({ controlled: true });
		renderHook(() => useServiceWorkerUpdate());

		await waitFor(() => expect(container.register).toHaveBeenCalled());

		Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
		act(() => {
			document.dispatchEvent(new Event('visibilitychange'));
		});

		expect(registration.update).not.toHaveBeenCalled();
	});
});
