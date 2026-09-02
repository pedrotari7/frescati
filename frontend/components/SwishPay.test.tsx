import * as stylex from '@stylexjs/stylex';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { bp } from '../app/tokens.stylex';
import { stylesFor, stylesOf } from '../test/stylex';
import SwishPay from './SwishPay';

/* Out of the way until the thing looking at it is a finger. */
const expected = stylex.create({ phoneOnly: { display: { default: 'none', [bp.coarse]: 'inline-flex' } } });

const mockWarn = jest.fn();

jest.mock('./Toast', () => ({
	useToast: () => ({ notify: jest.fn(), warn: mockWarn }),
}));

const mockDrawn: string[] = [];

/**
 * The real code generator, wrapped only to record what it was asked to draw.
 * `qrcode.react` puts the value nowhere in the DOM, and the value is the whole
 * question here, so a stub would leave the one assertion that matters untestable
 * and the paths test below asserting nothing.
 */
jest.mock('qrcode.react', () => {
	const actual = jest.requireActual('qrcode.react');

	// JSX rather than `createElement`, because a factory may not reach for a
	// top-level import unless its name starts with `mock`, and the runtime this
	// compiles to is one Babel imports for itself.
	return {
		...actual,
		QRCodeSVG: (props: { value: string }) => {
			mockDrawn.push(props.value);

			return <actual.QRCodeSVG {...props} />;
		},
	};
});

const pay = () => render(<SwishPay payee='0701234567' amount={1736} message='Fall 2026: Anna Berg' />);

describe('SwishPay', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockDrawn.length = 0;
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

	/**
	 * The mark is excavated rather than drawn over: `qrcode.react` clears the
	 * modules underneath it, so they have to be modules the code can afford to
	 * lose. How wide the code came out is the only place the DOM says which
	 * error correction level it ran at. 57 across is H for this payload and 41
	 * would be the M it used to use, and an M code with a hole in the middle is
	 * one a phone gives up on.
	 */
	it('excavates the app mark out of a code with the recovery to spare it', () => {
		const { container } = pay();

		const svg = container.querySelector('[data-testid="swish-qr"] svg')!;

		expect(svg.querySelector('image')).toHaveAttribute('href', '/qr-mark.svg');
		expect(svg).toHaveAttribute('viewBox', '0 0 57 57');
	});

	it('opens the app with the payment already filled in', () => {
		pay();

		const href = screen.getByTestId('swish-open').getAttribute('href')!;

		expect(href).toBe(
			'https://app.swish.nu/1/p/sw/?sw=46701234567&amt=1736&cur=SEK&msg=Fall%202026%3A%20Anna%20Berg&src=qr'
		);
	});

	/**
	 * The code carries a URL and not the `C0701234567;1736;...;0` payload it used
	 * to, because a phone camera offers to open a URL and does nothing whatever
	 * with a line of text. Pinned as the same string the button uses, since a code
	 * and a button that disagree is the bug nobody sees until somebody has paid.
	 */
	it('puts the same link in the code that the button holds', () => {
		pay();

		expect(mockDrawn).toEqual([screen.getByTestId('swish-open').getAttribute('href')]);
	});

	/**
	 * In the document at every width. The link is `display: none` until a
	 * `pointer: coarse` query says otherwise, and jsdom resolves no media queries
	 * at all, so what a test here can say is that the styling carries both halves.
	 * `e2e/finances.spec.ts` is the test that says a desktop is not offered it.
	 */
	it('leaves the desktop half of that decision to the stylesheet', () => {
		pay();

		expect(stylesOf(screen.getByTestId('swish-open'))).toEqual(
			expect.arrayContaining(stylesFor(expected.phoneOnly))
		);
	});

	it('copies the number in the form somebody would type into their bank', async () => {
		pay();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Copy number' }));
		});

		expect(navigator.clipboard.writeText).toHaveBeenCalledWith('0701234567');
		expect(mockWarn).not.toHaveBeenCalled();
	});

	it('says so when the clipboard refuses', async () => {
		jest.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		jest.spyOn(console, 'error').mockImplementation(() => {});

		pay();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Copy number' }));
		});

		expect(mockWarn).toHaveBeenCalledWith("Couldn't copy the number.");
	});

	/** Paying is not reporting. Only an admin marks a charge settled. */
	it('says out loud that paying ticks nothing off', () => {
		pay();

		expect(screen.getByText(/An admin marks it once the money has landed/)).toBeInTheDocument();
	});
});
