import { render, screen } from '@testing-library/react';
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
});
