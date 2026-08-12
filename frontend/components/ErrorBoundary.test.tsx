import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';
import { captureErrorAndFlush } from '../lib/sentry';

jest.mock('../lib/sentry', () => ({
	captureErrorAndFlush: jest.fn(() => Promise.resolve()),
}));

const flushSentry = captureErrorAndFlush as jest.MockedFunction<typeof captureErrorAndFlush>;

const Bomb = () => {
	throw new Error('boom');
};

/** Pretend this tab already reloaded itself just now, disarming the auto path. */
const alreadyReloaded = () => window.sessionStorage.setItem('frescati:error-reload', String(Date.now()));

describe('ErrorBoundary', () => {
	let reload: jest.Mock;

	beforeEach(() => {
		jest.spyOn(console, 'error').mockImplementation(() => {});

		reload = jest.fn();
		Object.defineProperty(window, 'location', {
			value: { ...window.location, reload },
			configurable: true,
		});

		// The boundary keeps its one-reload-per-episode mark here, so without
		// this the tests below would pass or fail depending on their order.
		window.sessionStorage.clear();
		flushSentry.mockClear();
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
		expect(reload).not.toHaveBeenCalled();
	});

	it('shows a fallback instead of crashing the page when a child throws', () => {
		alreadyReloaded();

		render(
			<ErrorBoundary>
				<Bomb />
			</ErrorBoundary>
		);

		expect(screen.getByText('Something broke')).toBeInTheDocument();
		expect(screen.queryByText('All good')).not.toBeInTheDocument();
	});

	it('logs the error for diagnostics', () => {
		alreadyReloaded();

		render(
			<ErrorBoundary>
				<Bomb />
			</ErrorBoundary>
		);

		expect(console.error).toHaveBeenCalledWith('Unhandled UI error', expect.any(Error), expect.any(String));
	});

	it('reloads the page from the fallback', () => {
		alreadyReloaded();

		render(
			<ErrorBoundary>
				<Bomb />
			</ErrorBoundary>
		);

		fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

		expect(reload).toHaveBeenCalledTimes(1);
	});

	describe('recovering on its own', () => {
		it('reloads once without being asked, since that is what the fallback advises anyway', async () => {
			render(
				<ErrorBoundary>
					<Bomb />
				</ErrorBoundary>
			);

			await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
		});

		it('reports before reloading, so the page does not leave with the report still queued', async () => {
			let flushed = false;
			flushSentry.mockImplementation(async () => {
				flushed = true;
			});

			render(
				<ErrorBoundary>
					<Bomb />
				</ErrorBoundary>
			);

			await waitFor(() => expect(reload).toHaveBeenCalled());
			expect(flushed).toBe(true);
			expect(flushSentry).toHaveBeenCalledWith(expect.any(Error), { componentStack: expect.any(String) });
		});

		it('does not reload a second time when the reload did not help', async () => {
			const { unmount } = render(
				<ErrorBoundary>
					<Bomb />
				</ErrorBoundary>
			);

			await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
			unmount();

			// The same crash on the way back. Looping here would replace a broken
			// screen with a flickering one.
			render(
				<ErrorBoundary>
					<Bomb />
				</ErrorBoundary>
			);

			await waitFor(() => expect(screen.getByText('Something broke')).toBeInTheDocument());
			expect(reload).toHaveBeenCalledTimes(1);
		});

		it('tries again for a crash long after the last one', async () => {
			window.sessionStorage.setItem('frescati:error-reload', String(Date.now() - 60_000));

			render(
				<ErrorBoundary>
					<Bomb />
				</ErrorBoundary>
			);

			await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
		});

		it('leaves it to the button when storage is blocked, rather than looping', async () => {
			// Safari in private mode throws outright rather than no-opping, and
			// an unrecorded attempt is one nothing can stop repeating.
			jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
				throw new Error('storage disabled');
			});

			render(
				<ErrorBoundary>
					<Bomb />
				</ErrorBoundary>
			);

			await waitFor(() => expect(screen.getByText('Something broke')).toBeInTheDocument());
			expect(reload).not.toHaveBeenCalled();
		});
	});
});
