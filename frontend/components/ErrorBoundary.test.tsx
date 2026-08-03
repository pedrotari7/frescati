import { fireEvent, render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

const Bomb = () => {
	throw new Error('boom');
};

describe('ErrorBoundary', () => {
	beforeEach(() => {
		jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('renders its children when nothing throws', () => {
		render(
			<ErrorBoundary>
				<p>All good</p>
			</ErrorBoundary>
		);

		expect(screen.getByText('All good')).toBeInTheDocument();
	});

	it('shows a fallback instead of crashing the page when a child throws', () => {
		render(
			<ErrorBoundary>
				<Bomb />
			</ErrorBoundary>
		);

		expect(screen.getByText('Something broke')).toBeInTheDocument();
		expect(screen.queryByText('All good')).not.toBeInTheDocument();
	});

	it('logs the error for diagnostics', () => {
		render(
			<ErrorBoundary>
				<Bomb />
			</ErrorBoundary>
		);

		expect(console.error).toHaveBeenCalledWith('Unhandled UI error', expect.any(Error), expect.any(String));
	});

	it('reloads the page from the fallback', () => {
		const reload = jest.fn();
		Object.defineProperty(window, 'location', {
			value: { ...window.location, reload },
			configurable: true,
		});

		render(
			<ErrorBoundary>
				<Bomb />
			</ErrorBoundary>
		);

		fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

		expect(reload).toHaveBeenCalledTimes(1);
	});
});
