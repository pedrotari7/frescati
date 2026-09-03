import { renderHook } from '@testing-library/react';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: mockPush }),
}));

import { useNotificationRoute } from './useNotificationRoute';
import type { Mock } from 'vitest';

/**
 * The page's half of a notification tap.
 *
 * What matters is that the worker always gets an answer: its fallback is a
 * full page load, which is the thing that broke iOS's fixed positioning in the
 * first place, and that the answer goes out whether or not the route change
 * that follows is a `router.push`.
 */

type Listener = (event: MessageEvent) => void;

let listeners: Listener[];
let container: { addEventListener: Mock; removeEventListener: Mock; startMessages: Mock };
let replace: Mock;

/** Stands in for the port the worker transfers with the message. */
const aPort = () => ({ postMessage: vi.fn() });

const at = (href: string) => {
	const url = new URL(href);
	Object.defineProperty(window, 'location', {
		value: { href: url.href, pathname: url.pathname, search: url.search, origin: url.origin, replace },
		configurable: true,
		writable: true,
	});
};

const send = (data: unknown, port?: { postMessage: Mock }) => {
	const event = { data, ports: port ? [port] : [] } as unknown as MessageEvent;
	for (const listener of listeners) listener(event);
};

beforeEach(() => {
	mockPush.mockClear();
	replace = vi.fn();
	listeners = [];

	container = {
		addEventListener: vi.fn((type: string, listener: Listener) => {
			if (type === 'message') listeners.push(listener);
		}),
		removeEventListener: vi.fn(),
		startMessages: vi.fn(),
	};

	Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
	at('https://frescati.test/s/season-1');
});

describe('useNotificationRoute', () => {
	// Without this the worker's messages sit in a queue nobody drains, and every
	// tap falls back to the navigation this exists to avoid.
	it('starts message delivery, which addEventListener alone does not', () => {
		renderHook(() => useNotificationRoute());

		expect(container.startMessages).toHaveBeenCalled();
	});

	it('routes in the page and tells the worker it has, so it does not also navigate', () => {
		renderHook(() => useNotificationRoute());
		const port = aPort();

		send({ type: 'NAVIGATE', url: '/s/season-1/g/game-1' }, port);

		expect(mockPush).toHaveBeenCalledWith('/s/season-1/g/game-1');
		expect(port.postMessage).toHaveBeenCalledWith({ type: 'NAVIGATING' });
	});

	it('carries the query across, since that is where the "I\'m in" intent rides', () => {
		renderHook(() => useNotificationRoute());

		send({ type: 'NAVIGATE', url: '/s/season-1/g/game-1?respond=in' }, aPort());

		expect(mockPush).toHaveBeenCalledWith('/s/season-1/g/game-1?respond=in');
	});

	/**
	 * `router.push` to the path we are already on re-renders without remounting,
	 * and `useRespondIntent` reads the parameter once on mount, so this tap
	 * would answer for nobody. Reloading is safe from here: the window is
	 * focused, on screen and measured, which is exactly what it is not when the
	 * worker starts a navigation into a backgrounded web view.
	 */
	it('reloads rather than pushes when only the query changed', () => {
		at('https://frescati.test/s/season-1/g/game-1');
		renderHook(() => useNotificationRoute());

		send({ type: 'NAVIGATE', url: '/s/season-1/g/game-1?respond=in' }, aPort());

		expect(replace).toHaveBeenCalledWith('https://frescati.test/s/season-1/g/game-1?respond=in');
		expect(mockPush).not.toHaveBeenCalled();
	});

	it('does nothing but answer when the window is already on that exact URL', () => {
		at('https://frescati.test/s/season-1/g/game-1');
		renderHook(() => useNotificationRoute());
		const port = aPort();

		send({ type: 'NAVIGATE', url: '/s/season-1/g/game-1' }, port);

		expect(port.postMessage).toHaveBeenCalledWith({ type: 'NAVIGATING' });
		expect(mockPush).not.toHaveBeenCalled();
		expect(replace).not.toHaveBeenCalled();
	});

	it('ignores a message that is not the worker asking for a route', () => {
		renderHook(() => useNotificationRoute());

		send({ type: 'SOMETHING_ELSE', url: '/s/season-1' }, aPort());
		send({ type: 'NAVIGATE' }, aPort());
		send(null, aPort());

		expect(mockPush).not.toHaveBeenCalled();
	});

	it('refuses an address off the origin', () => {
		renderHook(() => useNotificationRoute());
		const port = aPort();

		send({ type: 'NAVIGATE', url: 'https://elsewhere.test/s/season-1' }, port);

		expect(mockPush).not.toHaveBeenCalled();
		expect(port.postMessage).not.toHaveBeenCalled();
	});

	it('stops listening when it goes away', () => {
		const { unmount } = renderHook(() => useNotificationRoute());

		unmount();

		expect(container.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
	});
});
