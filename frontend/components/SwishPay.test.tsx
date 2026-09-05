import * as stylex from '@stylexjs/stylex';
import type * as QRCode from 'qrcode.react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { bp } from '../app/tokens.stylex';
import { stylesFor, stylesOf } from '../test/stylex';
import SwishPay from './SwishPay';

/* Out of the way until the thing looking at it is a finger. */
const expected = stylex.create({ phoneOnly: { display: { default: 'none', [bp.coarse]: 'inline-flex' } } });

const mockWarn = vi.fn();

vi.mock('./Toast', () => ({
	useToast: () => ({ notify: vi.fn(), warn: mockWarn }),
}));

const mockDrawn: string[] = [];

/**
 * The real code generator, wrapped only to record what it was asked to draw.
 * `qrcode.react` puts the value nowhere in the DOM, and the value is the whole
 * question here, so a stub would leave the one assertion that matters untestable
 * and the paths test below asserting nothing.
 */
vi.mock('qrcode.react', async () => {
	const actual = await vi.importActual<typeof QRCode>('qrcode.react');

	// JSX rather than `createElement`, because a factory is hoisted above the
	// imports and may not reach for one, and the runtime this compiles to is one
	// the compiler imports for itself.
	return {
		...actual,
		QRCodeSVG: (props: { value: string }) => {
			mockDrawn.push(props.value);

			return <actual.QRCodeSVG {...props} />;
		},
	};
});

const pay = () => render(<SwishPay payee='0701234567' amount={1736} message='Fall 2026: Anna Berg' />);

const jsdomUserAgent = navigator.userAgent;

const setUserAgent = (value: string) => Object.defineProperty(navigator, 'userAgent', { value, configurable: true });

/** jsdom reports a desktop, so an Android run has to be asked for. */
const onAndroid = () =>
	setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile');

const href = () => screen.getByTestId('swish-open').getAttribute('href')!;

describe('SwishPay', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDrawn.length = 0;
		// Or the first Android test leaves every test after it on Android.
		setUserAgent(jsdomUserAgent);
		Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
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

		expect(href()).toBe(
			'https://app.swish.nu/1/p/sw/?sw=46701234567&amt=1736&cur=SEK&msg=Fall%202026%3A%20Anna%20Berg&src=qr'
		);
	});

	/**
	 * Android will not hand an https link to an installed app unless the app
	 * verified its claim on `app.swish.nu` and the person left "Open supported
	 * links" on. Neither is ours to set, and when either is off the tap lands on
	 * Swish's download page. Naming the package skips the whole question.
	 */
	it('addresses the Swish package by name on Android', () => {
		onAndroid();
		pay();

		expect(href()).toBe(
			'intent://app.swish.nu/1/p/sw/?sw=46701234567&amt=1736&cur=SEK&msg=Fall%202026%3A%20Anna%20Berg&src=qr' +
				'#Intent;scheme=https;package=se.bankgirot.swish;S.browser_fallback_url=' +
				'https%3A%2F%2Fapp.swish.nu%2F1%2Fp%2Fsw%2F%3Fsw%3D46701234567%26amt%3D1736%26cur%3DSEK' +
				'%26msg%3DFall%25202026%253A%2520Anna%2520Berg%26src%3Dqr;end'
		);
	});

	/**
	 * The one place the code and the button are allowed to disagree. A camera
	 * reads the code, not a browser, and a camera handed `intent://` has nothing
	 * to open. Scanning is also the route that already worked on the phones this
	 * change is for, so it is the route not to touch.
	 */
	it('leaves the code an https link on Android, because a camera reads it', () => {
		onAndroid();
		pay();

		// Deduplicated because settling on Android is a state change, so the code
		// is drawn once before it and once after. That both are the same string
		// is the point: the swap moves the button and leaves the code alone.
		expect([...new Set(mockDrawn)]).toEqual([
			'https://app.swish.nu/1/p/sw/?sw=46701234567&amt=1736&cur=SEK&msg=Fall%202026%3A%20Anna%20Berg&src=qr',
		]);
	});

	/**
	 * The code carries a URL and not the `C0701234567;1736;...;0` payload it used
	 * to, because a phone camera offers to open a URL and does nothing whatever
	 * with a line of text. Pinned as the same string the button uses, since a code
	 * and a button that disagree is the bug nobody sees until somebody has paid.
	 */
	it('puts the same link in the code that the button holds', () => {
		pay();

		expect(mockDrawn).toEqual([href()]);
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
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		vi.spyOn(console, 'error').mockImplementation(() => {});

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
