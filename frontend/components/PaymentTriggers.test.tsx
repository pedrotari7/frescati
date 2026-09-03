import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Season } from '@shared/types';
import PaymentTriggers from './PaymentTriggers';

const mockWarn = vi.fn();

vi.mock('./Toast', () => ({
	useToast: () => ({ notify: vi.fn(), warn: mockWarn }),
}));

const aSeason = (overrides: Partial<Season> = {}): Season =>
	({
		id: 'fall-2026',
		name: 'Fall 2026',
		memberUids: ['a', 'b', 'c', 'd'],
		fees: { total: 4000, perGame: 70, swish: '0701234567' },
		...overrides,
	}) as Season;

const panel = (season: Season | null = aSeason(), displayName = 'Anna Berg') =>
	render(<PaymentTriggers season={season} displayName={displayName} />);

// Anchored rather than exact. `Field` puts the hint inside the same label, so
// the accessible name is the label followed by whatever the hint says today.
const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`), { selector: 'input' });

describe('PaymentTriggers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
	});

	/**
	 * The whole reason the defaults come off the season rather than out of a
	 * constant. A number written down in the component would prove the QR library
	 * works and say nothing about whether this season can collect at all.
	 */
	it('fills itself in from the season being tested', () => {
		panel();

		expect(field('Swish number')).toHaveValue('0701234567');
		// 4000 across four members, which is the share the season really charges.
		expect(field('Amount')).toHaveValue(1000);
		expect(field('Reference')).toHaveValue('Fall 2026: Anna Berg');
	});

	it('falls back to what an extra pays when the season has no bill of its own', () => {
		panel(aSeason({ fees: { total: 0, perGame: 70, swish: '0701234567' } }));

		expect(field('Amount')).toHaveValue(70);
	});

	it('hands Swish the link the real builder makes, with everything locked', () => {
		panel();

		expect(
			screen.getByText(
				'https://app.swish.nu/1/p/sw/?sw=46701234567&amt=1000&cur=SEK&msg=Fall%202026%3A%20Anna%20Berg&src=qr'
			)
		).toBeInTheDocument();
	});

	/**
	 * Only the last of the three goes into the link, and a number an admin typed
	 * with a country code has to come out of all of them correctly. None of these
	 * conversions is visible anywhere a player looks.
	 */
	it('shows the number in every form, including the one the link carries', () => {
		panel(aSeason({ fees: { total: 4000, perGame: 70, swish: '+46 70 123 45 67' } }));

		expect(screen.getByText(/0701234567 · \+46701234567 · 46701234567/)).toBeInTheDocument();
	});

	it('keeps a field you typed in and lets the rest follow the season', () => {
		const { rerender } = panel();

		fireEvent.change(field('Amount'), { target: { value: '1' } });
		rerender(<PaymentTriggers season={aSeason({ name: 'Spring 2027' })} displayName='Anna Berg' />);

		expect(field('Amount')).toHaveValue(1);
		expect(field('Reference')).toHaveValue('Spring 2027: Anna Berg');
	});

	/** This is the string an admin reads off a bank statement, and it gets cut silently. */
	it('counts the reference against the cap that truncates it', () => {
		panel(aSeason({ name: 'The Tuesday Night Football Season Of Two Thousand' }));

		expect(screen.getByText(/50\/50 characters, so this is cut/)).toBeInTheDocument();
	});

	it('draws no code without a number and an amount, and says why', () => {
		panel(aSeason({ fees: { total: 0, perGame: 0 } }));

		expect(screen.queryByTestId('swish-qr')).not.toBeInTheDocument();
		expect(screen.getByText(/Set a number and an amount above zero/)).toBeInTheDocument();
	});

	/**
	 * The real component rather than a copy of it, so a change to what a player is
	 * shown is a change to what this screen proves.
	 */
	it('draws the same panel a player who owes money is shown', () => {
		panel();

		expect(screen.getByTestId('swish-qr')).toBeInTheDocument();
		expect(screen.getByText(/1 000 kr to 0701234567/)).toBeInTheDocument();
	});

	it('says out loud that the code is live and settles nothing', () => {
		panel();

		expect(screen.getByText(/that is a real payment to a real number/)).toBeInTheDocument();
	});

	it('copies the link, for a code that will not scan', async () => {
		panel();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
		});

		expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
			'https://app.swish.nu/1/p/sw/?sw=46701234567&amt=1000&cur=SEK&msg=Fall%202026%3A%20Anna%20Berg&src=qr'
		);
		expect(mockWarn).not.toHaveBeenCalled();
	});

	it('offers a number to type when the season has none set', () => {
		panel(aSeason({ fees: { total: 4000, perGame: 70 } }));

		expect(screen.getByText(/This season has no number set/)).toBeInTheDocument();
		expect(field('Swish number')).toHaveValue('');
	});
});
