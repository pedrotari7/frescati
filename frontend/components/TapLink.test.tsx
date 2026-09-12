import { fireEvent, render, screen } from '@testing-library/react';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

import TapLink from './TapLink';

const link = () => screen.getByRole('link', { name: 'Club' });

const touch = { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 0, clientY: 0 } as const;

beforeEach(() => vi.clearAllMocks());

describe('TapLink', () => {
	it('is still an anchor with the href on it, so it can be opened any other way', () => {
		render(<TapLink href='/s/1/members'>Club</TapLink>);

		expect(link()).toHaveAttribute('href', '/s/1/members');
	});

	// The reported bug: a press that lands while the page is coasting never
	// becomes a click, and used to do nothing at all.
	it('navigates on a press that no click follows', () => {
		render(<TapLink href='/s/1/members'>Club</TapLink>);

		fireEvent.pointerDown(link(), touch);
		fireEvent.pointerUp(link(), touch);

		expect(mockPush).toHaveBeenCalledWith('/s/1/members');
	});

	it('runs onTap with it', () => {
		const onTap = vi.fn();
		render(
			<TapLink href='/s/1/members' onTap={onTap}>
				Club
			</TapLink>
		);

		fireEvent.pointerDown(link(), touch);
		fireEvent.pointerUp(link(), touch);

		expect(onTap).toHaveBeenCalledTimes(1);
	});

	it('navigates once when the click arrives as well', () => {
		render(<TapLink href='/s/1/members'>Club</TapLink>);

		fireEvent.pointerDown(link(), touch);
		fireEvent.pointerUp(link(), touch);
		fireEvent.click(link());

		expect(mockPush).toHaveBeenCalledTimes(1);
	});

	// What the tab bar measures its pill against.
	it('hands its element on to a ref', () => {
		const seen = vi.fn();
		render(
			<TapLink href='/s/1/members' ref={seen}>
				Club
			</TapLink>
		);

		expect(seen).toHaveBeenCalledWith(expect.any(HTMLAnchorElement));
	});
});
