import { render, screen } from '@testing-library/react';
import type { Game, GameResponse, Season } from '@shared/types';
import { EMPTY_COUNTS } from '@shared/types';
import NextGameHero from './NextGameHero';

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
		venue: { name: 'Frescati IP' },
		counts: { ...EMPTY_COUNTS, membersIn: 10, playing: 10 },
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

describe('NextGameHero', () => {
	it('shows the date, time and venue of the next game', () => {
		render(
			<NextGameHero
				game={game({})}
				season={season}
				myResponse={undefined}
				isExtra={false}
				now={now}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByText('Tuesday 1 Sep')).toBeInTheDocument();
		expect(screen.getByText('17:00')).toBeInTheDocument();
		expect(screen.getByText('Frescati IP')).toBeInTheDocument();
	});

	it('offers the respond control while the game is open', () => {
		render(
			<NextGameHero
				game={game({})}
				season={season}
				myResponse={undefined}
				isExtra={false}
				now={now}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByRole('button', { name: /I'm in/ })).not.toBeDisabled();
	});

	it('locks the respond control and explains why once past the response deadline', () => {
		const locked = new Date('2026-08-31T18:00:00.000Z');

		render(
			<NextGameHero
				game={game({})}
				season={season}
				myResponse={undefined}
				isExtra={false}
				now={locked}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByText('Locked')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /I'm in/ })).toBeDisabled();
		expect(screen.getByText(/Answers closed 24h before kickoff/)).toBeInTheDocument();
	});

	it('replaces the respond control with the reason when the game is cancelled', () => {
		render(
			<NextGameHero
				game={game({ status: 'cancelled', cancelledReason: 'Pitch closed for maintenance.' })}
				season={season}
				myResponse={undefined}
				isExtra={false}
				now={now}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByText('Cancelled')).toBeInTheDocument();
		expect(screen.getByText('Pitch closed for maintenance.')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /I'm in/ })).not.toBeInTheDocument();
	});

	it('falls back to a generic message when a cancelled game has no reason recorded', () => {
		render(
			<NextGameHero
				game={game({ status: 'cancelled' })}
				season={season}
				myResponse={undefined}
				isExtra={false}
				now={now}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByText('This game is off.')).toBeInTheDocument();
	});

	it('warns an extra that they need admin confirmation to hold their spot', () => {
		render(
			<NextGameHero
				game={game({})}
				season={season}
				myResponse={undefined}
				isExtra
				now={now}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.getByText(/you'll be listed as an extra/)).toBeInTheDocument();
	});

	it('says nothing about extras for a season member', () => {
		render(
			<NextGameHero
				game={game({})}
				season={season}
				myResponse={response({})}
				isExtra={false}
				now={now}
				onRespond={jest.fn()}
				onClear={jest.fn()}
			/>
		);

		expect(screen.queryByText(/you'll be listed as an extra/)).not.toBeInTheDocument();
	});
});
