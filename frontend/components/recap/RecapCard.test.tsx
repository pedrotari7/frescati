import { render, screen } from '@testing-library/react';
import RecapCard from './RecapCard';

describe('RecapCard', () => {
	it('opens the season recap', () => {
		render(<RecapCard seasonId='autumn' seasonName='Autumn 2026' />);

		expect(screen.getByRole('link', { name: /watch the season recap/i })).toHaveAttribute(
			'href',
			'/s/autumn/recap'
		);
		expect(screen.getByText('Autumn 2026 is over.')).toBeInTheDocument();
	});
});
