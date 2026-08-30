import { act, fireEvent, render, screen } from '@testing-library/react';
import SwishPay from './SwishPay';

const warn = jest.fn();

jest.mock('./Toast', () => ({
	useToast: () => ({ notify: jest.fn(), warn }),
}));

const pay = () => render(<SwishPay payee='0701234567' amount={1736} message='Fall 2026: Anna Berg' />);

describe('SwishPay', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
	});

	it('says what is being paid, to whom, and what it will be marked against', () => {
		pay();

		expect(screen.getByText(/1 736 kr to 0701234567/)).toBeInTheDocument();
		expect(screen.getByText('Fall 2026: Anna Berg')).toBeInTheDocument();
	});

	/**
	 * `next.config.js` claims as a security property that this app contains no
	 * `dangerouslySetInnerHTML`, so the code has to be React elements. A library
	 * handing back a string of SVG would pass every other assertion here.
	 */
	it('draws the code as real SVG paths rather than injected markup', () => {
		const { container } = pay();

		expect(container.querySelector('[data-testid="swish-qr"] svg path')).toBeInTheDocument();
	});

	it('opens the app with the payment already filled in', () => {
		pay();

		const href = screen.getByTestId('swish-open').getAttribute('href')!;

		expect(href.startsWith('swish://payment?data=')).toBe(true);
		expect(JSON.parse(decodeURIComponent(href.slice('swish://payment?data='.length)))).toEqual({
			version: 1,
			payee: { value: '+46701234567' },
			amount: { value: 1736 },
			message: { value: 'Fall 2026: Anna Berg' },
		});
	});

	/**
	 * In the document at every width. The link is hidden by a `pointer: coarse`
	 * media query, which jsdom cannot see at all, which is why `e2e/finances.spec.ts`
	 * is the test that says a desktop is not offered it.
	 */
	it('leaves the desktop half of that decision to the stylesheet', () => {
		pay();

		expect(screen.getByTestId('swish-open')).toHaveClass('hidden', 'pointer-coarse:inline-flex');
	});

	it('copies the number in the form somebody would type into their bank', async () => {
		pay();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Copy number' }));
		});

		expect(navigator.clipboard.writeText).toHaveBeenCalledWith('0701234567');
		expect(warn).not.toHaveBeenCalled();
	});

	it('says so when the clipboard refuses', async () => {
		jest.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		jest.spyOn(console, 'error').mockImplementation(() => {});

		pay();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Copy number' }));
		});

		expect(warn).toHaveBeenCalledWith("Couldn't copy the number.");
	});

	/** Paying is not reporting. Only an admin marks a charge settled. */
	it('says out loud that paying ticks nothing off', () => {
		pay();

		expect(screen.getByText(/An admin marks it once the money has landed/)).toBeInTheDocument();
	});
});
