import { render, screen } from '@testing-library/react';
import type { Game, Season } from '@shared/types';
import { EMPTY_COUNTS } from '@shared/types';
import HeadcountBar from './HeadcountBar';

const season = { minPlayers: 10, memberUids: Array.from({ length: 10 }, (_, i) => `member-${i}`) } as Season;

const game = (counts: Partial<typeof EMPTY_COUNTS>): Game =>
	({
		minPlayers: undefined,
		counts: { ...EMPTY_COUNTS, ...counts },
	}) as Game;

describe('HeadcountBar', () => {
	it('reads as at-risk and says how many more are needed below the minimum', () => {
		render(<HeadcountBar game={game({ membersIn: 4, playing: 4 })} season={season} />);

		expect(screen.getByText('4')).toBeInTheDocument();
		expect(screen.getByText('of 10 needed')).toBeInTheDocument();
		expect(screen.getByText('Need 6 more')).toBeInTheDocument();
	});

	it('reads as ready and shows the format once the minimum is met', () => {
		render(<HeadcountBar game={game({ membersIn: 10, playing: 10 })} season={season} />);

		expect(screen.getByText('playing')).toBeInTheDocument();
		expect(screen.queryByText(/needed/)).not.toBeInTheDocument();
		expect(screen.queryByText(/more/)).not.toBeInTheDocument();
	});

	it('counts confirmed extras toward playing and shows them in the breakdown', () => {
		render(
			<HeadcountBar
				game={game({ membersIn: 8, extrasConfirmed: 2, playing: 10 })}
				season={season}
			/>
		);

		expect(screen.getByText('8 squad')).toBeInTheDocument();
		expect(screen.getByText('2 extra')).toBeInTheDocument();
	});

	it('mentions members who are out only when there are some', () => {
		const { rerender } = render(<HeadcountBar game={game({ membersIn: 10, playing: 10 })} season={season} />);
		expect(screen.queryByText(/out$/)).not.toBeInTheDocument();

		rerender(<HeadcountBar game={game({ membersIn: 8, membersOut: 2, playing: 8 })} season={season} />);
		expect(screen.getByText('2 out')).toBeInTheDocument();
	});

	it('counts members who have not answered at all', () => {
		render(<HeadcountBar game={game({ membersIn: 3, membersOut: 2, playing: 3 })} season={season} />);

		expect(screen.getByText('5 yet to answer')).toBeInTheDocument();
	});

	it('lets a per-game minimum override the season default', () => {
		render(
			<HeadcountBar
				game={{ ...game({ membersIn: 4, playing: 4 }), minPlayers: 4 } as Game}
				season={season}
			/>
		);

		expect(screen.getByText('playing')).toBeInTheDocument();
	});
});
