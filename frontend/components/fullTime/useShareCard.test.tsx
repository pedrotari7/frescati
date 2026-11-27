import { act, render, screen } from '@testing-library/react';
import type { FullTimeCard } from '@shared/fullTime';
import { useShareCard } from './useShareCard';

const image = new Blob(['png'], { type: 'image/png' });
const mocks = {
	render: vi.fn(async () => image),
	share: vi.fn(async (_blob: Blob, _name: string) => 'shared' as const),
};

vi.mock('../../lib/fullTimeImage', () => ({
	readCardPalette: () => ({}),
	renderFullTimeImage: () => mocks.render(),
	shareImage: (blob: Blob, name: string) => mocks.share(blob, name),
}));

const card = { gameId: 'g', team: 0 } as FullTimeCard;
const labels = { team: 'Team A', finish: '1st of 2', date: 'Tuesday 24 Nov', app: 'Frescati' };

const Harness = () => {
	const { swatches, share } = useShareCard(card, labels);

	return (
		<div>
			{swatches}
			<button onClick={() => void share()}>Share</button>
		</div>
	);
};

beforeEach(() => vi.clearAllMocks());

describe('useShareCard', () => {
	it('paints the image as soon as the card is shown', async () => {
		render(<Harness />);
		await act(async () => {});

		expect(mocks.render).toHaveBeenCalledTimes(1);
	});

	// iOS only opens the share sheet inside the tap. Painting the image after the
	// tap and then sharing it used to lose the gesture on the way.
	it('shares the image painted in advance without painting it again', async () => {
		render(<Harness />);
		await act(async () => {});

		await act(async () => screen.getByRole('button', { name: 'Share' }).click());

		expect(mocks.render).toHaveBeenCalledTimes(1);
		expect(mocks.share).toHaveBeenCalledWith(image, 'full-time-g.png');
	});
});
