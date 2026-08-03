import { render, screen } from '@testing-library/react';
import StatusPill from './StatusPill';

describe('StatusPill', () => {
	it('defaults to the neutral tone', () => {
		render(<StatusPill>Waiting</StatusPill>);

		expect(screen.getByText('Waiting')).toHaveClass('text-muted');
	});

	it('renders the tone-specific text colour', () => {
		render(<StatusPill tone='in'>In</StatusPill>);

		expect(screen.getByText('In')).toHaveClass('text-in');
	});

	it('accepts extra classes alongside the tone', () => {
		render(
			<StatusPill tone='out' className='ml-2'>
				Out
			</StatusPill>
		);

		expect(screen.getByText('Out')).toHaveClass('text-out', 'ml-2');
	});
});
