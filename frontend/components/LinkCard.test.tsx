import { render, screen } from '@testing-library/react';
import LinkCard from './LinkCard';

describe('LinkCard', () => {
	it('links to where it says, with its title and detail', () => {
		render(<LinkCard href='/s/s/g/g/programme' icon={<svg />} title='Matchday programme' detail='Odds and form' />);

		const link = screen.getByRole('link', { name: /matchday programme/i });
		expect(link).toHaveAttribute('href', '/s/s/g/g/programme');
		expect(link).toHaveTextContent('Odds and form');
	});

	it('leaves the detail out when there is none', () => {
		render(<LinkCard href='/x' icon={<svg />} title='Teams' />);

		expect(screen.getByRole('link')).toHaveTextContent(/^Teams$/);
	});
});
