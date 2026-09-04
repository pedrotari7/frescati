import { render, screen } from '@testing-library/react';
import type { Game, Season } from '@shared/types';
import { EMPTY_COUNTS } from '@shared/types';
import HeadcountBar from './HeadcountBar';
import { animations } from '../lib/styles';
import { stylesFor, stylesOf } from '../test/stylex';

const season = { minPlayers: 10, memberUids: Array.from({ length: 10 }, (_, i) => `member-${i}`) } as Season;

const game = (counts: Partial<typeof EMPTY_COUNTS>): Game =>
	({
		minPlayers: undefined,
		counts: { ...EMPTY_COUNTS, ...counts },
	}) as Game;

/**
 * Whether the bar is celebrating, read off the one element that says so in
 * every case. The glint and the pill each come and go for reasons of their own,
 * the pill is not drawn at all below the minimum, but the number is always
 * there and only swells on the crossing.
 */
const celebrating = () => {
	const worn = stylesOf(screen.getByTestId('headcount-playing'));
	return stylesFor(animations.swell).every(name => worn.includes(name));
};

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
		render(<HeadcountBar game={game({ membersIn: 8, extrasConfirmed: 2, playing: 10 })} season={season} />);

		expect(screen.getByText('8 squad')).toBeInTheDocument();
		expect(screen.getByText('2 extra')).toBeInTheDocument();
	});

	/**
	 * The gap the strip exists to explain: three extras have said they are
	 * coming and the number above has moved for one of them.
	 */
	it('says how many extras are waiting on a spot', () => {
		render(
			<HeadcountBar game={game({ membersIn: 8, extrasIn: 3, extrasConfirmed: 1, playing: 9 })} season={season} />
		);

		expect(screen.getByText('2 awaiting a spot')).toBeInTheDocument();
	});

	it('says nothing about a queue once every extra has been waved through', () => {
		render(
			<HeadcountBar game={game({ membersIn: 8, extrasIn: 2, extrasConfirmed: 2, playing: 10 })} season={season} />
		);

		expect(screen.queryByText(/awaiting a spot/)).not.toBeInTheDocument();
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
			<HeadcountBar game={{ ...game({ membersIn: 4, playing: 4 }), minPlayers: 4 } as Game} season={season} />
		);

		expect(screen.getByText('playing')).toBeInTheDocument();
	});

	/*
	 * The five below are all one rule: the bar celebrates a game *turning* on
	 * and nothing else. It is the only motion on this card, and it is worth
	 * something only while it keeps meaning that one thing.
	 */
	it('celebrates the answer that tips the game over its minimum', () => {
		const { rerender } = render(<HeadcountBar game={game({ membersIn: 9, playing: 9 })} season={season} />);
		expect(celebrating()).toBe(false);

		rerender(<HeadcountBar game={game({ membersIn: 10, playing: 10 })} season={season} />);
		expect(celebrating()).toBe(true);
	});

	it('says nothing about a game that was already on when the screen opened', () => {
		const { rerender } = render(<HeadcountBar game={game({ membersIn: 10, playing: 10 })} season={season} />);
		expect(celebrating()).toBe(false);

		// Still on, one more player. Being on is not news twice.
		rerender(<HeadcountBar game={game({ membersIn: 11, playing: 11 })} season={season} />);
		expect(celebrating()).toBe(false);
	});

	/**
	 * The hero card draws the denormalised counts until its own responses
	 * listener lands and then swaps to its tally of them. That swap can cross
	 * the minimum on its own, and it is the screen loading rather than anybody
	 * answering.
	 */
	it('sits out the swap from placeholder counts to the real ones', () => {
		const { rerender } = render(
			<HeadcountBar game={game({ membersIn: 4, playing: 4 })} season={season} settling />
		);

		rerender(<HeadcountBar game={game({ membersIn: 10, playing: 10 })} season={season} settling={false} />);
		expect(celebrating()).toBe(false);
	});

	it('still celebrates the first real crossing after that swap', () => {
		const { rerender } = render(
			<HeadcountBar game={game({ membersIn: 4, playing: 4 })} season={season} settling />
		);

		rerender(<HeadcountBar game={game({ membersIn: 9, playing: 9 })} season={season} settling={false} />);
		expect(celebrating()).toBe(false);

		rerender(<HeadcountBar game={game({ membersIn: 10, playing: 10 })} season={season} settling={false} />);
		expect(celebrating()).toBe(true);
	});

	// Clears the shortfall without anybody turning up, so there is nothing to
	// celebrate. An admin editing the season is not eleven people arriving.
	it('does not celebrate an admin dropping the minimum instead', () => {
		const { rerender } = render(<HeadcountBar game={game({ membersIn: 8, playing: 8 })} season={season} />);
		expect(celebrating()).toBe(false);

		rerender(
			<HeadcountBar game={{ ...game({ membersIn: 8, playing: 8 }), minPlayers: 8 } as Game} season={season} />
		);
		expect(screen.getByText('playing')).toBeInTheDocument();
		expect(celebrating()).toBe(false);
	});
});
