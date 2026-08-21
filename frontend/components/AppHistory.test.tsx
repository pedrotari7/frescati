import { act, render, screen } from '@testing-library/react';

let pathname = '/s/1';

jest.mock('next/navigation', () => ({ usePathname: () => pathname }));

import { AppHistoryProvider, useAppHistory } from './AppHistory';

const Probe = () => {
	const { canGoBack } = useAppHistory();

	return <span data-testid='back'>{String(canGoBack)}</span>;
};

const canGoBack = () => screen.getByTestId('back').textContent === 'true';

/**
 * A journey through the app, driven the way a browser drives one: the location
 * moves, `history.length` grows or doesn't, and a step backwards announces
 * itself with a `popstate`. Nothing here mocks the provider's own reasoning.
 */
const journey = (start: string) => {
	pathname = start;
	window.history.pushState({}, '', start);

	// A fresh element every time: React bails out of re-rendering the very same
	// one, and the provider would never re-read the path.
	const tree = () => (
		<AppHistoryProvider>
			<Probe />
		</AppHistoryProvider>
	);

	const { rerender } = render(tree());

	const move = (path: string, arrive: () => void) =>
		act(() => {
			arrive();
			pathname = path;
			rerender(tree());
		});

	return {
		/** A tap on a link. */
		push: (path: string) => move(path, () => window.history.pushState({}, '', path)),

		/** A redirect. Changes the screen without adding an entry to go back to. */
		replace: (path: string) => move(path, () => window.history.replaceState({}, '', path)),

		/**
		 * The browser's own back — or forward. Both land on an entry that is
		 * already there, so the length doesn't move and a `popstate` fires.
		 */
		pop: (path: string) =>
			move(path, () => {
				window.history.replaceState({}, '', path);
				window.dispatchEvent(new PopStateEvent('popstate'));
			}),
	};
};

describe('AppHistoryProvider', () => {
	// A notification tap, a pasted link, the first screen of the installed app:
	// there is no screen behind this one, so the chevron has to fall back to the
	// parent the screen declares.
	it('has nothing behind the screen it loaded on', () => {
		journey('/u/anna');

		expect(canGoBack()).toBe(false);
	});

	it('has somewhere to go back to once a screen has been opened', () => {
		const trip = journey('/s/1/g/2');

		trip.push('/u/anna');

		expect(canGoBack()).toBe(true);
	});

	it('is back where it started once that screen has been left again', () => {
		const trip = journey('/s/1/g/2');

		trip.push('/u/anna');
		trip.pop('/s/1/g/2');

		expect(canGoBack()).toBe(false);
	});

	// The live-game redirect and the season picker resolving to a sole season
	// both land somebody on a screen they never chose. There is no entry behind
	// it, so a `router.back()` would leave the app.
	it('counts a redirect as no step at all', () => {
		const trip = journey('/s/1');

		trip.replace('/s/1/g/2');

		expect(canGoBack()).toBe(false);
	});

	it('still knows where it is after a redirect on the way through', () => {
		const trip = journey('/s/1');

		trip.replace('/s/1/g/2');
		trip.push('/s/1/g/2/tournament');
		trip.pop('/s/1/g/2');

		expect(canGoBack()).toBe(false);
	});

	// A desktop back menu or an Android long-press crosses several entries at
	// once. Counting one off per `popstate` would leave the chevron believing in
	// screens that are no longer there.
	it('unwinds every screen a single step backwards crossed', () => {
		const trip = journey('/s/1');

		trip.push('/s/1/g/2');
		trip.push('/u/anna');
		trip.pop('/s/1');

		expect(canGoBack()).toBe(false);
	});

	it('finds the earlier visit when a screen has been seen twice', () => {
		const trip = journey('/s/1');

		trip.push('/u/anna');
		trip.push('/s/1');
		trip.push('/u/bo');
		trip.pop('/s/1');

		expect(canGoBack()).toBe(true);
	});

	// Forward lands on an entry this document had been rewound past, which is a
	// screen gained rather than one given up.
	it('counts a step forward like the push it undoes', () => {
		const trip = journey('/s/1');

		trip.push('/u/anna');
		trip.pop('/s/1');
		trip.pop('/u/anna');

		expect(canGoBack()).toBe(true);
	});
});
