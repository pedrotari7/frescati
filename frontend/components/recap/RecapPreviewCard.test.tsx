import { render, screen } from '@testing-library/react';
import RecapPreviewCard from './RecapPreviewCard';

describe('RecapPreviewCard', () => {
	it('previews the season picked above', () => {
		render(<RecapPreviewCard seasonId='autumn' />);

		expect(screen.getByRole('link', { name: 'Preview recap' })).toHaveAttribute(
			'href',
			'/s/autumn/recap?preview=1'
		);
	});

	it('asks for a season when none is picked', () => {
		render(<RecapPreviewCard seasonId={null} />);

		expect(screen.queryByRole('link')).not.toBeInTheDocument();
		expect(screen.getByText('Pick a season above to preview its recap.')).toBeInTheDocument();
	});
});
