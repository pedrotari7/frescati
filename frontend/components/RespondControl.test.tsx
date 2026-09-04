import { act, fireEvent, render, screen } from '@testing-library/react';
import type { GameResponse, ResponseStatus } from '@shared/types';
import RespondControl from './RespondControl';
import { animations } from '../lib/styles';
import { stylesFor, stylesOf } from '../test/stylex';
import type { Mock } from 'vitest';

const answered = (status: ResponseStatus, overrides: Partial<GameResponse> = {}): GameResponse => ({
	uid: 'me',
	status,
	role: 'member',
	respondedAt: '2026-08-30T10:00:00.000Z',
	updatedAt: '2026-08-30T10:00:00.000Z',
	...overrides,
});

/**
 * The ring a half throws off when it takes the answer, or null.
 *
 * The only `<span>` either button ever holds. Its label is a bare text node and
 * its icon is an `<svg>`, so there is nothing else this can find.
 */
const ringInside = (button: HTMLElement) => button.querySelector('span');

const isRinging = (button: HTMLElement) => {
	const ring = ringInside(button);
	if (!ring) return false;

	const worn = stylesOf(ring);
	return stylesFor(animations.ripple).every(name => worn.includes(name));
};

const mockNotify = vi.fn();
const mockWarn = vi.fn();

vi.mock('./Toast', () => ({
	useToast: () => ({ notify: mockNotify, warn: mockWarn }),
}));

describe('RespondControl', () => {
	beforeEach(() => vi.clearAllMocks());

	it('says which answer is yours in words, not only in colour', () => {
		render(<RespondControl response={answered('in')} onRespond={vi.fn()} onClear={vi.fn()} />);

		expect(screen.getByRole('button', { name: /You're in/ })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('button', { name: /Can't make it/ })).toHaveAttribute('aria-pressed', 'false');
		expect(screen.queryByRole('button', { name: /I'm in/ })).not.toBeInTheDocument();
	});

	// An extra's In does not put them on the pitch until an admin confirms the
	// spot, and the note under these buttons says so. The button must not
	// contradict it.
	it('does not tell an extra still waiting on a spot that they are in', () => {
		render(<RespondControl response={answered('in', { role: 'extra' })} onRespond={vi.fn()} onClear={vi.fn()} />);

		expect(screen.getByRole('button', { name: /I'm in/ })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.queryByText("You're in")).not.toBeInTheDocument();
	});

	it('says an extra is in once the spot is confirmed', () => {
		render(
			<RespondControl
				response={answered('in', { role: 'extra', confirmOverride: true })}
				onRespond={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		expect(screen.getByRole('button', { name: /You're in/ })).toBeInTheDocument();
	});

	it('answers in when tapped with no existing response', async () => {
		const onRespond = vi.fn().mockResolvedValue(undefined);

		render(<RespondControl response={undefined} onRespond={onRespond} onClear={vi.fn()} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
		});

		expect(onRespond).toHaveBeenCalledWith('in');
	});

	// The tap the whole redesign is about. It reads as "am I in?", and it used
	// to answer by taking the player out.
	it('writes nothing when the answer already given is tapped again', async () => {
		const onRespond = vi.fn().mockResolvedValue(undefined);
		const onClear = vi.fn().mockResolvedValue(undefined);

		render(<RespondControl response={answered('in')} onRespond={onRespond} onClear={onClear} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /You're in/ }));
		});

		expect(onClear).not.toHaveBeenCalled();
		expect(onRespond).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: /You're in/ })).toHaveAttribute('aria-pressed', 'true');
	});

	it('withdraws the answer through a button that says so', async () => {
		const onClear = vi.fn().mockResolvedValue(undefined);

		render(<RespondControl response={answered('out')} onRespond={vi.fn()} onClear={onClear} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Clear answer' }));
		});

		expect(onClear).toHaveBeenCalledTimes(1);
	});

	it('offers nothing to withdraw until there is an answer', () => {
		render(<RespondControl response={undefined} onRespond={vi.fn()} onClear={vi.fn()} />);

		expect(screen.queryByRole('button', { name: 'Clear answer' })).not.toBeInTheDocument();
		expect(screen.getByText(/You haven't answered yet/)).toBeInTheDocument();
	});

	// The row above a small control already carries a "No answer" pill.
	it('leaves the unanswered note to the row it sits in when small', () => {
		render(<RespondControl response={undefined} onRespond={vi.fn()} onClear={vi.fn()} size='sm' />);

		expect(screen.queryByText(/You haven't answered yet/)).not.toBeInTheDocument();
	});

	it('switches straight from out to in', async () => {
		const onRespond = vi.fn().mockResolvedValue(undefined);
		const onClear = vi.fn().mockResolvedValue(undefined);

		render(<RespondControl response={answered('out')} onRespond={onRespond} onClear={onClear} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
		});

		expect(onRespond).toHaveBeenCalledWith('in');
		expect(onClear).not.toHaveBeenCalled();
	});

	it('does nothing while disabled, and stops offering a withdrawal', async () => {
		const onRespond = vi.fn().mockResolvedValue(undefined);

		render(<RespondControl response={answered('in')} onRespond={onRespond} onClear={vi.fn()} disabled />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /Can't make it/ }));
		});

		expect(onRespond).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: /Can't make it/ })).toBeDisabled();
		expect(screen.queryByRole('button', { name: 'Clear answer' })).not.toBeInTheDocument();
	});

	it('refuses a second tap while the first write is still in flight', async () => {
		let settle: () => void = () => {};
		const onRespond = vi.fn().mockImplementation(
			() =>
				new Promise<void>(resolve => {
					settle = resolve;
				})
		);

		render(<RespondControl response={answered('out')} onRespond={onRespond} onClear={vi.fn()} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
		});

		// Both halves are held, and visibly. The tap below used to be swallowed
		// by `write`'s own guard with the buttons still looking live, which is
		// indistinguishable from a tap that missed.
		expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
		expect(screen.getByRole('button', { name: /You're out/ })).toBeDisabled();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /You're out/ }));
		});

		expect(onRespond).toHaveBeenCalledTimes(1);
		expect(onRespond).toHaveBeenCalledWith('in');

		// And handed back the moment the write lands.
		await act(async () => {
			settle();
		});

		expect(screen.getByRole('button', { name: /I'm in/ })).toBeEnabled();
	});

	it('warns when the write fails, and clears the pending state either way', async () => {
		const onRespond = vi.fn().mockRejectedValue(new Error('offline'));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		render(<RespondControl response={undefined} onRespond={onRespond} onClear={vi.fn()} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
		});

		expect(mockWarn).toHaveBeenCalledWith("Couldn't save your answer. Try again in a moment.");
		expect(screen.getByRole('button', { name: /I'm in/ })).toHaveTextContent("I'm in");

		(console.error as Mock).mockRestore();
	});

	it('warns when a withdrawal fails too', async () => {
		const onClear = vi.fn().mockRejectedValue(new Error('offline'));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		render(<RespondControl response={answered('in')} onRespond={vi.fn()} onClear={onClear} />);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Clear answer' }));
		});

		expect(mockWarn).toHaveBeenCalledWith("Couldn't save your answer. Try again in a moment.");
		expect(screen.getByRole('button', { name: 'Clear answer' })).toBeEnabled();

		(console.error as Mock).mockRestore();
	});

	describe('when they owe the season money', () => {
		const debtLock = { outstanding: 140, href: '/s/s1/finances' };

		it('holds the In half and leaves saying you cannot make it alone', async () => {
			const onRespond = vi.fn().mockResolvedValue(undefined);

			render(<RespondControl response={undefined} onRespond={onRespond} onClear={vi.fn()} debtLock={debtLock} />);

			expect(screen.getByRole('button', { name: /I'm in/ })).toBeDisabled();
			expect(screen.getByRole('button', { name: /Can't make it/ })).toBeEnabled();

			await act(async () => {
				fireEvent.click(screen.getByRole('button', { name: /Can't make it/ }));
			});

			expect(onRespond).toHaveBeenCalledWith('out');
		});

		it('writes nothing if the held half is tapped anyway', async () => {
			const onRespond = vi.fn().mockResolvedValue(undefined);

			render(<RespondControl response={undefined} onRespond={onRespond} onClear={vi.fn()} debtLock={debtLock} />);

			await act(async () => {
				fireEvent.click(screen.getByRole('button', { name: /I'm in/ }));
			});

			expect(onRespond).not.toHaveBeenCalled();
		});

		// A disabled button with no reason beside it reads as a broken app, and
		// this replaces the unanswered note rather than stacking under it.
		it('says what is owed and where to settle it, instead of the unanswered note', () => {
			render(<RespondControl response={undefined} onRespond={vi.fn()} onClear={vi.fn()} debtLock={debtLock} />);

			expect(screen.getByText(/You owe 140 kr/)).toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'Settle up' })).toHaveAttribute('href', '/s/s1/finances');
			expect(screen.queryByText(/You haven't answered yet/)).not.toBeInTheDocument();
		});

		// A game row is where somebody meets the lock with no season notice on
		// screen to explain it, so this line is drawn at both sizes.
		it('explains itself in a game row too', () => {
			render(
				<RespondControl
					response={undefined}
					onRespond={vi.fn()}
					onClear={vi.fn()}
					debtLock={debtLock}
					size='sm'
				/>
			);

			expect(screen.getByText(/You owe 140 kr/)).toBeInTheDocument();
		});

		// Charged after they said yes. Draining the In would say they had been
		// dropped from a game they are still playing in.
		it('leaves an In given before the charge drawn as the answer it is', () => {
			render(
				<RespondControl response={answered('in')} onRespond={vi.fn()} onClear={vi.fn()} debtLock={debtLock} />
			);

			expect(screen.getByRole('button', { name: /You're in/ })).toBeEnabled();
			expect(screen.queryByText(/You owe/)).not.toBeInTheDocument();
		});

		it('still lets them take that In back', async () => {
			const onClear = vi.fn().mockResolvedValue(undefined);

			render(
				<RespondControl response={answered('in')} onRespond={vi.fn()} onClear={onClear} debtLock={debtLock} />
			);

			await act(async () => {
				fireEvent.click(screen.getByRole('button', { name: 'Clear answer' }));
			});

			expect(onClear).toHaveBeenCalledTimes(1);
		});

		// The other direction of the same rule: an Out on file is not a way back in.
		it('will not turn an out back into an in', () => {
			render(
				<RespondControl response={answered('out')} onRespond={vi.fn()} onClear={vi.fn()} debtLock={debtLock} />
			);

			expect(screen.getByRole('button', { name: /I'm in/ })).toBeDisabled();
			expect(screen.getByRole('button', { name: 'Clear answer' })).toBeEnabled();
		});

		// Answers are closed, so there is nothing for the debt to hold and no
		// reason to explain a button nobody can press.
		it('says nothing about money once answers have closed', () => {
			render(
				<RespondControl
					response={undefined}
					onRespond={vi.fn()}
					onClear={vi.fn()}
					debtLock={debtLock}
					disabled
				/>
			);

			expect(screen.queryByText(/You owe/)).not.toBeInTheDocument();
		});
	});

	/*
	 * The ring is the receipt for the tap, so it fires on the answer changing
	 * and never on the answer merely being there. A control that replays your
	 * last answer every time you open the app confirms nothing. It just moves.
	 */
	describe('the ring that confirms a tap', () => {
		it('replays nothing for an answer that was already on the document', () => {
			render(<RespondControl response={answered('in')} onRespond={vi.fn()} onClear={vi.fn()} />);

			expect(isRinging(screen.getByRole('button', { name: /You're in/ }))).toBe(false);
		});

		it('rings the half that just became the answer', () => {
			const { rerender } = render(<RespondControl response={undefined} onRespond={vi.fn()} onClear={vi.fn()} />);
			expect(isRinging(screen.getByRole('button', { name: /I'm in/ }))).toBe(false);

			rerender(<RespondControl response={answered('in')} onRespond={vi.fn()} onClear={vi.fn()} />);

			const chosen = screen.getByRole('button', { name: /You're in/ });
			expect(isRinging(chosen)).toBe(true);
			// The half that was passed over stays still. Only one of them took
			// the answer.
			expect(isRinging(screen.getByRole('button', { name: /Can't make it/ }))).toBe(false);
		});

		it('moves the ring across when the answer changes sides', () => {
			const { rerender } = render(
				<RespondControl response={answered('in')} onRespond={vi.fn()} onClear={vi.fn()} />
			);

			rerender(<RespondControl response={answered('out')} onRespond={vi.fn()} onClear={vi.fn()} />);

			expect(isRinging(screen.getByRole('button', { name: /You're out/ }))).toBe(true);
			expect(isRinging(screen.getByRole('button', { name: /I'm in/ }))).toBe(false);
		});

		// Withdrawing leaves no chosen half, and the pair going quiet is the
		// whole point of that action.
		it('rings nothing when the answer is withdrawn', () => {
			const { rerender } = render(
				<RespondControl response={answered('in')} onRespond={vi.fn()} onClear={vi.fn()} />
			);

			rerender(<RespondControl response={undefined} onRespond={vi.fn()} onClear={vi.fn()} />);

			expect(isRinging(screen.getByRole('button', { name: /I'm in/ }))).toBe(false);
			expect(isRinging(screen.getByRole('button', { name: /Can't make it/ }))).toBe(false);
		});
	});
});
