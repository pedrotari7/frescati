import { render, screen } from '@testing-library/react';
import type { Due, SeasonFees } from '@shared/types';
import PaymentCodes from './PaymentCodes';

vi.mock('./Toast', () => ({
	useToast: () => ({ notify: vi.fn(), warn: vi.fn() }),
}));

const due = (kind: Due['kind'], amount: number): Pick<Due, 'kind' | 'amount' | 'status'> => ({
	kind,
	amount,
	status: 'owing',
});

const split: SeasonFees = {
	total: 0,
	perGame: 70,
	payees: { entry: { swish: '0701111111' }, extras: { swish: '0702222222' } },
};

const draw = (
	dues: ReturnType<typeof due>[],
	fees: SeasonFees,
	mySwish: string | null = null,
	hasBook = true,
	canSettle = true
) =>
	render(
		<PaymentCodes
			dues={dues}
			fees={fees}
			reference='Fall 2026: Anna'
			mySwish={mySwish}
			canSettle={canSettle}
			hasBook={hasBook}
		/>
	);

describe('PaymentCodes', () => {
	it('draws one code for each number, with that number is amount', () => {
		draw([due('entry', 500), due('game', 70)], split);

		expect(screen.getAllByTestId('swish-qr')).toHaveLength(2);
		expect(screen.getByText(/500 kr to 0701111111/)).toBeInTheDocument();
		expect(screen.getByText(/70 kr to 0702222222/)).toBeInTheDocument();
		expect(screen.getByText('Season fee')).toBeInTheDocument();
		expect(screen.getByText("Extras' fees")).toBeInTheDocument();
	});

	it('draws one code, with no heading, when both pots share a number', () => {
		draw([due('entry', 500), due('game', 70)], { total: 0, perGame: 70, swish: '0703333333' });

		expect(screen.getAllByTestId('swish-qr')).toHaveLength(1);
		expect(screen.getByText(/570 kr to 0703333333/)).toBeInTheDocument();
		expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
	});

	it('labels a code for game charges alone as the extras', () => {
		draw([due('game', 70)], split);

		expect(screen.getAllByTestId('swish-qr')).toHaveLength(1);
		expect(screen.getByText("Extras' fees")).toBeInTheDocument();
	});

	it("draws no code for a number that is the viewer's own", () => {
		draw([due('entry', 500)], split, '0701111111');

		expect(screen.queryByTestId('swish-qr')).not.toBeInTheDocument();
		expect(screen.getByText('This one is paid to you. Mark it paid in the book below.')).toBeInTheDocument();
	});

	it("matches the viewer's own number however it was typed", () => {
		draw([due('entry', 500)], split, '+46 70 111 11 11');

		expect(screen.queryByTestId('swish-qr')).not.toBeInTheDocument();
	});

	it('says to mark it yourself where there is no book', () => {
		draw([due('entry', 500)], split, '0701111111', false);

		expect(screen.getByText('This one is paid to you, so mark it paid yourself.')).toBeInTheDocument();
	});

	it('sends a viewer who cannot settle charges to an admin, with a book or without', () => {
		draw([due('entry', 500)], split, '0701111111', true, false);

		expect(
			screen.getByText('This one is paid to you. Ask an admin of this season to mark it paid.')
		).toBeInTheDocument();
		expect(screen.queryByText(/book below/)).not.toBeInTheDocument();
	});

	it('asks for an admin on a pot with no number and still draws the other code', () => {
		draw([due('entry', 500), due('game', 70)], {
			total: 0,
			perGame: 70,
			payees: { entry: { uid: 'admin-1' }, extras: { swish: '0702222222' } },
		});

		expect(
			screen.getByText('No Swish number is set for this, so ask an admin where to send it.')
		).toBeInTheDocument();
		expect(screen.getAllByTestId('swish-qr')).toHaveLength(1);
		expect(screen.getByText(/70 kr to 0702222222/)).toBeInTheDocument();
	});

	it('draws one code when both pots hold the same number written two ways', () => {
		draw([due('entry', 500), due('game', 70)], {
			total: 0,
			perGame: 70,
			payees: { entry: { swish: '070 111 11 11' }, extras: { swish: '0701111111' } },
		});

		expect(screen.getAllByTestId('swish-qr')).toHaveLength(1);
		expect(screen.getByText(/570 kr/)).toBeInTheDocument();
	});

	it('asks for an admin on a blank number, even when the viewer has a blank one saved', () => {
		draw([due('entry', 500)], { total: 0, perGame: 70, payees: { entry: { swish: ' ' } } }, ' ');

		expect(
			screen.getByText('No Swish number is set for this, so ask an admin where to send it.')
		).toBeInTheDocument();
		expect(screen.queryByTestId('swish-qr')).not.toBeInTheDocument();
	});

	it('draws nothing when nothing is owed', () => {
		const { container } = draw([], split);

		expect(container).toBeEmptyDOMElement();
	});
});
