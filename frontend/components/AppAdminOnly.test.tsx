import { fireEvent, render, screen } from '@testing-library/react';

const mockPush = jest.fn();

// Rendered whole rather than shallow, because the way back this asserts on
// lives in `PageShell`'s `TopBar` rather than in the component under test —
// and it is a button calling `router.push`, not a link.
jest.mock('next/navigation', () => ({
	usePathname: () => '/admin',
	useRouter: () => ({ push: mockPush }),
}));

jest.mock('../lib/auth', () => ({ useAuth: () => ({ user: null }) }));

import AppAdminOnly from './AppAdminOnly';

beforeEach(() => jest.clearAllMocks());

describe('AppAdminOnly', () => {
	it('says why there is nothing here', () => {
		render(<AppAdminOnly title='Debug' message='This screen sends real notifications.' />);

		expect(screen.getByText('App admins only')).toBeInTheDocument();
		expect(screen.getByText('This screen sends real notifications.')).toBeInTheDocument();
	});

	/**
	 * The screen keeps its own title rather than being replaced wholesale, so
	 * somebody who followed a link can see which screen they were refused and
	 * has the top bar's back chevron to leave by.
	 */
	it('keeps the screen it is standing in for named', () => {
		render(<AppAdminOnly title='Starting ratings' message='Anything.' />);

		expect(screen.getByText('Starting ratings')).toBeInTheDocument();
	});

	// Five of six screens hang off /me; only the season creator goes elsewhere.
	it('defaults the way back to /me', () => {
		render(<AppAdminOnly title='Activity' message='Anything.' />);

		fireEvent.click(screen.getByRole('button', { name: 'Back' }));

		expect(mockPush).toHaveBeenCalledWith('/me');
	});

	it('takes a different way back when given one', () => {
		render(<AppAdminOnly title='New season' message='Anything.' backHref='/seasons' />);

		fireEvent.click(screen.getByRole('button', { name: 'Back' }));

		expect(mockPush).toHaveBeenCalledWith('/seasons');
	});
});
