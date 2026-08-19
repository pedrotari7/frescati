import { fireEvent, render, screen } from '@testing-library/react';
import Avatar from './Avatar';

describe('Avatar', () => {
	it('shows initials when there is no photo', () => {
		render(<Avatar displayName='Alice Ng' photoURL={null} />);

		expect(screen.getByText('AN')).toBeInTheDocument();
	});

	it('renders a photo instead of initials when one is given', () => {
		const { container } = render(<Avatar displayName='Alice Ng' photoURL='https://example.com/alice.png' />);

		expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/alice.png');
		expect(screen.queryByText('AN')).not.toBeInTheDocument();
	});

	it('exposes the full name as a title for a tooltip on hover', () => {
		render(<Avatar displayName='Alice Ng' photoURL={null} />);

		expect(screen.getByTitle('Alice Ng')).toBeInTheDocument();
	});

	// Google's avatar URLs rotate and expire. Without this the circle just went
	// blank, on every screen that person appears on, for good.
	it('falls back to initials when the photo fails to load', () => {
		const { container } = render(<Avatar displayName='Alice Ng' photoURL='https://example.com/gone.png' />);

		fireEvent.error(container.querySelector('img')!);

		expect(screen.getByText('AN')).toBeInTheDocument();
		expect(container.querySelector('img')).not.toBeInTheDocument();
	});

	it('tries again when the photo changes rather than staying on initials', () => {
		const { container, rerender } = render(
			<Avatar displayName='Alice Ng' photoURL='https://example.com/gone.png' />
		);

		fireEvent.error(container.querySelector('img')!);
		rerender(<Avatar displayName='Alice Ng' photoURL='https://example.com/new.png' />);

		expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/new.png');
	});

	// Nearly every avatar sits beside the same person's name, and the initials
	// are a stand-in for a face rather than something to read out.
	it('hides the initials from a screen reader', () => {
		render(<Avatar displayName='Alice Ng' photoURL={null} />);

		expect(screen.getByText('AN')).toHaveAttribute('aria-hidden', 'true');
	});
});
