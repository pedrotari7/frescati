import { render, screen } from '@testing-library/react';
import Person from './Person';

const anna = { displayName: 'Anna Bergström', photoURL: null };

describe('Person', () => {
	it('draws the avatar and the name', () => {
		render(<Person person={anna} />);

		// The avatar falls back to initials with no photo, which is what says it
		// is there at all.
		expect(screen.getByText('AB')).toBeInTheDocument();
		expect(screen.getByText('Anna Bergström')).toBeInTheDocument();
	});

	it('puts children under the name rather than beside the avatar', () => {
		render(
			<Person person={anna}>
				<span>App admin</span>
			</Person>
		);

		const pill = screen.getByText('App admin');

		expect(pill).toBeInTheDocument();
		expect(pill.parentElement).toContainElement(screen.getByText('Anna Bergström'));
	});

	it('is fine with nothing under the name', () => {
		render(<Person person={anna} />);

		expect(screen.getByText('Anna Bergström').parentElement?.childElementCount).toBe(1);
	});

	// The photo is the real case. Initials are the fallback.
	it('renders the photo when there is one', () => {
		const { container } = render(<Person person={{ ...anna, photoURL: 'https://example.test/anna.png' }} />);

		expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/anna.png');
	});
});
