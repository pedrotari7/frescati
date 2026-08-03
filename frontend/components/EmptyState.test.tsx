import { render, screen } from '@testing-library/react';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
	it('renders the title alone when nothing else is passed', () => {
		render(<EmptyState title='No games yet' />);

		expect(screen.getByText('No games yet')).toBeInTheDocument();
	});

	it('renders the message, icon and action when provided', () => {
		render(
			<EmptyState
				title='No games yet'
				message='Once a season starts, its games show up here.'
				icon={<svg data-testid='icon' />}
				action={<button type='button'>Create a season</button>}
			/>
		);

		expect(screen.getByText('Once a season starts, its games show up here.')).toBeInTheDocument();
		expect(screen.getByTestId('icon')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Create a season' })).toBeInTheDocument();
	});

	it('omits the message when none is given', () => {
		render(<EmptyState title='No games yet' />);

		expect(screen.queryByText(/./, { selector: 'p.text-muted' })).not.toBeInTheDocument();
	});
});
