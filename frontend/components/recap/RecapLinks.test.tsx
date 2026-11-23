import { render, screen } from '@testing-library/react';
import type { RatingLedgerEntry, Season } from '@shared/types';
import RecapLinks from './RecapLinks';

const season = (id: string, name: string, recapReadyAt?: string) =>
	[id, { id, name, endDate: '2026-01-01', recapReadyAt } as Season] as const;

const played = (seasonId: string) => ({ seasonId, gameId: `${seasonId}-g1` }) as RatingLedgerEntry;

describe('RecapLinks', () => {
	it("links each finished season they played in to their own season's story, newest first", () => {
		render(
			<RecapLinks
				uid='anna'
				entries={[played('spring'), played('autumn'), played('spring')]}
				seasonsById={
					new Map([
						season('spring', 'Spring 2026', '2026-06-01T00:00:00.000Z'),
						season('autumn', 'Autumn 2026', '2026-11-01T00:00:00.000Z'),
					])
				}
			/>
		);

		const links = screen.getAllByRole('link');
		expect(links.map(link => link.textContent)).toEqual(['Autumn 2026', 'Spring 2026']);
		expect(links[0]).toHaveAttribute('href', '/s/autumn/recap?player=anna');
	});

	it('leaves out a season that is not over, and says nothing when none are', () => {
		const { container } = render(
			<RecapLinks
				uid='anna'
				entries={[played('autumn')]}
				seasonsById={new Map([season('autumn', 'Autumn 2026')])}
			/>
		);

		expect(container).toBeEmptyDOMElement();
	});
});
