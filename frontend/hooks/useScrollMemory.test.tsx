import { act, renderHook } from '@testing-library/react';
import { useScrollMemory } from './useScrollMemory';

/**
 * A page whose height and scroll position the test decides, because jsdom lays
 * nothing out. `scrollTo` moves the position the way a browser would, clamped
 * to whatever the document can currently offer.
 */
const page = { height: 0, scrollY: 0 };

const scrollTo = vi.fn(({ top }: { top: number }) => {
	page.scrollY = Math.min(top, Math.max(0, page.height - window.innerHeight));
});

const frame = () => act(() => vi.advanceTimersByTime(16));

/** Scroll somewhere on `path` and let the recorder see it. */
const leaveAt = (path: string, y: number) => {
	window.history.pushState({}, '', path);
	page.scrollY = y;
	window.dispatchEvent(new Event('scroll'));
	frame();
};

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
	page.height = 3000;
	page.scrollY = 0;
	scrollTo.mockClear();
	Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true });
	Object.defineProperty(window, 'scrollY', { get: () => page.scrollY, configurable: true });
	Object.defineProperty(document.documentElement, 'scrollHeight', { get: () => page.height, configurable: true });
	window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});

afterEach(() => vi.useRealTimers());

describe('useScrollMemory', () => {
	it('puts a screen back where it was left once the page is tall enough', () => {
		const { result } = renderHook(() => useScrollMemory());
		leaveAt('/s/a/g/1', 823);
		page.height = 0;

		act(() => result.current('/s/a/g/1'));
		frame();
		expect(scrollTo).not.toHaveBeenCalled();

		page.height = 3000;
		frame();

		expect(page.scrollY).toBe(823);
	});

	// The game screen rebuilds its roster when the answers land, which empties
	// the list for a frame. The browser clamps the position to the short page
	// and nothing used to put it back, so a game left at 823 came back at 139.
	it('puts it back again when the page shrinks for a moment just after', () => {
		const { result } = renderHook(() => useScrollMemory());
		leaveAt('/s/a/g/1', 823);

		act(() => result.current('/s/a/g/1'));
		frame();
		expect(page.scrollY).toBe(823);

		page.height = 859;
		page.scrollY = 139;
		frame();
		page.height = 3000;
		frame();

		expect(page.scrollY).toBe(823);
	});

	it('lets go once the person scrolls themselves', () => {
		const { result } = renderHook(() => useScrollMemory());
		leaveAt('/s/a/g/1', 823);

		act(() => result.current('/s/a/g/1'));
		frame();

		window.dispatchEvent(new Event('wheel'));
		page.scrollY = 400;
		frame();

		expect(page.scrollY).toBe(400);
	});

	it('stops holding the position after a moment', () => {
		const { result } = renderHook(() => useScrollMemory());
		leaveAt('/s/a/g/1', 823);

		act(() => result.current('/s/a/g/1'));
		frame();
		act(() => vi.advanceTimersByTime(5_000));
		scrollTo.mockClear();

		page.scrollY = 100;
		frame();

		expect(scrollTo).not.toHaveBeenCalled();
	});
});
