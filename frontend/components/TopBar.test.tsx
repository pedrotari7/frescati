import { act, fireEvent, render, screen } from '@testing-library/react';

const mockPush = jest.fn();
const mockBack = jest.fn();

let mockPathname = '/u/anna';

jest.mock('next/navigation', () => ({
	usePathname: () => mockPathname,
	useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('../lib/auth', () => ({ useAuth: () => ({ user: null }) }));

import { AppHistoryProvider } from './AppHistory';
import TopBar from './TopBar';

/**
 * The real provider rather than a stubbed one: what is worth asserting here is
 * that the chevron and the thing that knows where it came from are wired
 * together, which a mocked `useAppHistory` would assert about nothing.
 */
const open = (start: string) => {
	mockPathname = start;
	window.history.pushState({}, '', start);

	// A fresh element every time: React bails out of re-rendering the very same
	// one, and the provider would never re-read the path.
	const tree = () => (
		<AppHistoryProvider>
			<TopBar title='Player' backHref='/s/1' />
		</AppHistoryProvider>
	);

	const { rerender } = render(tree());

	return {
		push: (path: string) =>
			act(() => {
				window.history.pushState({}, '', path);
				mockPathname = path;
				rerender(tree());
			}),
		back: () => fireEvent.click(screen.getByRole('button', { name: 'Back' })),
	};
};

beforeEach(() => jest.clearAllMocks());

describe('TopBar', () => {
	// The screen's declared parent is the only answer available to a game opened
	// from a notification: there is nothing behind it to go back to.
	it('goes up to the declared parent when nothing is behind the screen', () => {
		open('/u/anna').back();

		expect(mockPush).toHaveBeenCalledWith('/s/1');
		expect(mockBack).not.toHaveBeenCalled();
	});

	/**
	 * The bug this exists for: a player opened from a game's roster used to go
	 * back to the season page, throwing away the game somebody was reading.
	 */
	it('goes back the way it came when there is a way back', () => {
		const trip = open('/s/1/g/2');

		trip.push('/u/anna');
		trip.back();

		expect(mockBack).toHaveBeenCalled();
		expect(mockPush).not.toHaveBeenCalled();
	});
});
