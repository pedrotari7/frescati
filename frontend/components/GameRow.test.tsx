import { render, screen } from '@testing-library/react';
import type { Game, GameResponse, Season } from '@shared/types';
import { EMPTY_COUNTS } from '@shared/types';
import GameRow from './GameRow';

const season = {
	id: 'season-1',
	minPlayers: 10,
	responseDeadlineHours: 24,
	memberUids: Array.from({ length: 10 }, (_, i) => `member-${i}`),
	slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'UTC' },
} as Season;

const game = (overrides: Partial<Game>): Game =>
	({
		id: 'game-1',
		kickoff: '2026-09-01T17:00:00.000Z',
		endsAt: '2026-09-01T18:30:00.000Z',
		status: 'scheduled',
		isOneOff: false,
		counts: { ...EMPTY_COUNTS },
		...overrides,
	}) as Game;

const response = (overrides: Partial<GameResponse>): GameResponse => ({
	uid: 'me',
	status: 'in',
	role: 'member',
	respondedAt: '2026-08-30T10:00:00.000Z',
	updatedAt: '2026-08-30T10:00:00.000Z',
	...overrides,
});

const now = new Date('2026-08-25T12:00:00.000Z');

describe('GameRow', () => {
	it('links to the game and shows date, time and headcount', () => {
		render(
			<GameRow
				game={game({ counts: { ...EMPTY_COUNTS, membersIn: 10, playing: 10 } })}
				season={season}
				myResponse={undefined}
				now={now}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByRole('link')).toHaveAttribute('href', '/s/season-1/g/game-1');
		expect(screen.getByText('Tue 1 Sep')).toBeInTheDocument();
		expect(screen.getByText('17:00')).toBeInTheDocument();
		expect(screen.getByText('10 playing')).toBeInTheDocument();
	});

	it('flags a game short of players as at risk', () => {
		render(
			<GameRow
				game={game({ counts: { ...EMPTY_COUNTS, membersIn: 4, playing: 4 } })}
				season={season}
				myResponse={undefined}
				now={now}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByText('Short')).toBeInTheDocument();
	});

	it('shows a cancelled game as cancelled instead of a headcount', () => {
		render(
			<GameRow
				game={game({ status: 'cancelled' })}
				season={season}
				myResponse={undefined}
				now={now}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByText('Cancelled')).toBeInTheDocument();
		expect(screen.queryByText(/playing/)).not.toBeInTheDocument();
	});

	it("shows the player's own answer when they have responded", () => {
		render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={response({ status: 'in' })}
				now={now}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByText("You're in")).toBeInTheDocument();
	});

	it('prompts an answer for an open game with no response yet', () => {
		render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={undefined}
				now={now}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByText('No answer')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /I'm in/ })).toBeInTheDocument();
	});

	it('hides the respond control once the game is no longer open', () => {
		const past = new Date('2026-09-01T19:00:00.000Z');

		render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={undefined}
				now={past}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.queryByRole('button', { name: /I'm in/ })).not.toBeInTheDocument();
	});

	it('follows a caller that points the row somewhere else', () => {
		render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={undefined}
				href='/s/season-1/g/game-1/tournament'
				now={now}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByRole('link')).toHaveAttribute('href', '/s/season-1/g/game-1/tournament');
	});

	// A played game is faded, but not while it is still asking the squad for
	// something — that row is the one thing on the screen with a deadline.
	it('flags a played game whose man-of-the-match vote is open, undimmed', () => {
		const afterwards = new Date('2026-09-01T19:00:00.000Z');

		const { container } = render(
			<GameRow
				game={game({ motmVotingUntilMillis: new Date('2026-09-03T19:00:00.000Z').getTime() })}
				season={season}
				myResponse={undefined}
				now={afterwards}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByText('Vote open')).toBeInTheDocument();
		expect(container.firstElementChild).not.toHaveClass('opacity-70');
	});

	it('fades a played game once the vote has been counted', () => {
		const afterwards = new Date('2026-09-01T19:00:00.000Z');

		const { container } = render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={undefined}
				now={afterwards}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.queryByText('Vote open')).not.toBeInTheDocument();
		expect(container.firstElementChild).toHaveClass('opacity-70');
	});

	it('marks a one-off game', () => {
		render(
			<GameRow
				game={game({ isOneOff: true })}
				season={season}
				myResponse={undefined}
				now={now}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByText('One-off')).toBeInTheDocument();
	});
});
