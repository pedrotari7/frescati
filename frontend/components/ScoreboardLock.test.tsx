import { act, fireEvent, render, screen } from '@testing-library/react';
import ScoreboardLock from './ScoreboardLock';
import { ConfirmProvider } from './ConfirmDialog';

const onChange = vi.fn();

// Rendered inside the real provider rather than a stub: the whole point of this
// component is that a tap does nothing until a second, separate one says it
// meant it, and a mocked-out dialog would let that unravel without a test
// noticing. `ConfirmContext` defaults to "yes" outside a provider, see
// `ConfirmDialog`, so the unasked case has to be the one that is set up.
const draw = async (correcting = false) => {
	const view = render(
		<ConfirmProvider>
			<ScoreboardLock correcting={correcting} onChange={onChange} />
		</ConfirmProvider>
	);

	// Headless UI settles its own transition state a microtask after mount.
	await act(async () => {});

	return view;
};

const unlock = () => screen.getByRole('button', { name: /Correct a score/ });

describe('ScoreboardLock', () => {
	beforeEach(() => vi.clearAllMocks());

	it('asks before it unlocks anything', async () => {
		await draw();

		await act(async () => {
			fireEvent.click(unlock());
		});

		expect(onChange).not.toHaveBeenCalled();
		expect(screen.getByText('Correct a confirmed score?')).toBeInTheDocument();
	});

	// The replay is what makes this worth a dialog at all, so the dialog has to
	// be the thing that says so.
	it('says the ratings will be worked out again', async () => {
		await draw();

		await act(async () => {
			fireEvent.click(unlock());
		});

		expect(screen.getByText(/every game played since/)).toBeInTheDocument();
	});

	it('unlocks once that is confirmed', async () => {
		await draw();

		await act(async () => {
			fireEvent.click(unlock());
		});

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Correct it' }));
		});

		expect(onChange).toHaveBeenCalledWith(true);
	});

	// A cancel that unlocked anyway would be the accidental change this exists
	// to prevent, arrived at the long way round.
	it('leaves the scoreboard alone when the dialog is dismissed', async () => {
		await draw();

		await act(async () => {
			fireEvent.click(unlock());
		});

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		});

		expect(onChange).not.toHaveBeenCalled();
	});

	// Locking back up is not a decision anybody can regret, so it is one tap.
	it('locks straight back up without asking', async () => {
		await draw(true);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Done' }));
		});

		expect(onChange).toHaveBeenCalledWith(false);
		expect(screen.queryByText('Correct a confirmed score?')).not.toBeInTheDocument();
	});

	it('says which state the scoreboard is in either way', async () => {
		const { rerender } = await draw();

		expect(screen.getByText(/the score is settled/i)).toBeInTheDocument();

		rerender(
			<ConfirmProvider>
				<ScoreboardLock correcting onChange={onChange} />
			</ConfirmProvider>
		);

		expect(screen.getByText('Correcting a confirmed score')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /Correct a score/ })).not.toBeInTheDocument();
	});
});
