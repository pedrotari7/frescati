import * as stylex from '@stylexjs/stylex';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Game, GameResponse, Season } from '@shared/types';
import { EMPTY_COUNTS } from '@shared/types';
import { stylesFor, stylesOf } from '../test/stylex';
import GameRow from './GameRow';

/* The fade a game is drawn with once there is nothing left to do about it. */
const expected = stylex.create({ past: { opacity: 0.7 } });

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

const bell = () => screen.queryByRole('switch', { name: /notify/i });

describe('GameRow', () => {
	it('links to the game and shows date, time and headcount', () => {
		render(
			<GameRow
				game={game({ counts: { ...EMPTY_COUNTS, membersIn: 10, playing: 10 } })}
				season={season}
				myResponse={undefined}
				now={now}
				onRespond={vi.fn()}
				onClear={vi.fn()}
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
				onRespond={vi.fn()}
				onClear={vi.fn()}
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
				onRespond={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		expect(screen.getByText('Cancelled')).toBeInTheDocument();
		expect(screen.queryByText(/playing/)).not.toBeInTheDocument();
	});

	// Once, in the buttons, which are the loudest thing in the row. The pill
	// that used to say it too is what carries the answer after they are gone.
	it("shows the player's own answer once while the game is still open", () => {
		render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={response({ status: 'in' })}
				now={now}
				onRespond={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		expect(screen.getByRole('button', { name: /You're in/ })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.queryByText('No answer')).not.toBeInTheDocument();
		expect(screen.getAllByText("You're in")).toHaveLength(1);
	});

	it("keeps the player's own answer on a game that can no longer be answered", () => {
		const past = new Date('2026-09-02T12:00:00.000Z');

		render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={response({ status: 'in' })}
				now={past}
				onRespond={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		expect(screen.queryByRole('button', { name: /in/ })).not.toBeInTheDocument();
		expect(screen.getByText("You're in")).toBeInTheDocument();
	});

	/**
	 * The headcount beside this pill is the number an extra's In deliberately
	 * does not move, so this is the row that has to say why.
	 */
	it('says an extra is still waiting on a spot', () => {
		render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={response({ status: 'in', role: 'extra' })}
				now={now}
				onRespond={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		expect(screen.getByText('Spot pending')).toBeInTheDocument();
		expect(screen.queryByText("You're in")).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: /I'm in/ })).toHaveAttribute('aria-pressed', 'true');
	});

	it('says an extra is in once an admin has confirmed them', () => {
		render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={response({ status: 'in', role: 'extra', confirmOverride: true })}
				now={now}
				onRespond={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		expect(screen.getByRole('button', { name: /You're in/ })).toBeInTheDocument();
		expect(screen.queryByText('Spot pending')).not.toBeInTheDocument();
	});

	// Nobody is going to confirm a spot for a game that has been played, so the
	// wait is over rather than pending.
	it('settles a never-confirmed extra to no spot once the game is behind us', () => {
		render(
			<GameRow
				game={game({ kickoff: '2026-08-18T17:00:00.000Z', endsAt: '2026-08-18T18:30:00.000Z' })}
				season={season}
				myResponse={response({ status: 'in', role: 'extra' })}
				now={now}
				onRespond={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		expect(screen.getByText('No spot')).toBeInTheDocument();
		expect(screen.queryByText('Spot pending')).not.toBeInTheDocument();
	});

	it('prompts an answer for an open game with no response yet', () => {
		render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={undefined}
				now={now}
				onRespond={vi.fn()}
				onClear={vi.fn()}
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
				onRespond={vi.fn()}
				onClear={vi.fn()}
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
				onRespond={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		expect(screen.getByRole('link')).toHaveAttribute('href', '/s/season-1/g/game-1/tournament');
	});

	// A played game is faded, but not while it is still asking the squad for
	// something, that row is the one thing on the screen with a deadline.
	it('flags a played game whose man-of-the-match vote is open, undimmed', () => {
		const afterwards = new Date('2026-09-01T19:00:00.000Z');

		const { container } = render(
			<GameRow
				game={game({ motmVotingUntilMillis: new Date('2026-09-03T19:00:00.000Z').getTime() })}
				season={season}
				myResponse={undefined}
				now={afterwards}
				onRespond={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		expect(screen.getByText('Vote open')).toBeInTheDocument();
		expect(stylesOf(container.firstElementChild)).not.toEqual(expect.arrayContaining(stylesFor(expected.past)));
	});

	it('fades a played game once the vote has been counted', () => {
		const afterwards = new Date('2026-09-01T19:00:00.000Z');

		const { container } = render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={undefined}
				now={afterwards}
				onRespond={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		expect(screen.queryByText('Vote open')).not.toBeInTheDocument();
		expect(stylesOf(container.firstElementChild)).toEqual(expect.arrayContaining(stylesFor(expected.past)));
	});

	it('marks a one-off game', () => {
		render(
			<GameRow
				game={game({ isOneOff: true })}
				season={season}
				myResponse={undefined}
				now={now}
				onRespond={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		expect(screen.getByText('One-off')).toBeInTheDocument();
	});

	// Following a game no longer costs a trip to its own screen: every row on
	// the calendar carries the same bell the next-game card does.
	it('offers the bell on a game still to come, and toggles it', () => {
		const onWatchChange = vi.fn();

		render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={undefined}
				now={now}
				onRespond={vi.fn()}
				onClear={vi.fn()}
				onWatchChange={onWatchChange}
			/>
		);

		fireEvent.click(bell()!);

		expect(onWatchChange).toHaveBeenCalledWith(true);
	});

	it('draws the bell as on for a game already followed', () => {
		render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={undefined}
				watching
				now={now}
				onRespond={vi.fn()}
				onClear={vi.fn()}
				onWatchChange={vi.fn()}
			/>
		);

		expect(bell()).toHaveAttribute('aria-checked', 'true');
	});

	// The bell is a button and the row is a link. Nested, the link swallows it.
	// which is why it sits beside the link rather than inside it.
	it('keeps the bell out of the link the row leads with', () => {
		render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={undefined}
				now={now}
				onRespond={vi.fn()}
				onClear={vi.fn()}
				onWatchChange={vi.fn()}
			/>
		);

		expect(screen.getByRole('link')).not.toContainElement(bell());
	});

	it('drops the bell on a game that is off, there is nothing left to hear about', () => {
		render(
			<GameRow
				game={game({ status: 'cancelled' })}
				season={season}
				myResponse={undefined}
				now={now}
				onRespond={vi.fn()}
				onClear={vi.fn()}
				onWatchChange={vi.fn()}
			/>
		);

		expect(bell()).not.toBeInTheDocument();
	});

	// Nothing arrives about a game that has been played, so nothing offers to
	// turn it on, the row it is drawn on is in the Played list either way.
	it('drops the bell on a game already played', () => {
		render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={undefined}
				now={new Date('2026-09-01T19:00:00.000Z')}
				onRespond={vi.fn()}
				onClear={vi.fn()}
				onWatchChange={vi.fn()}
			/>
		);

		expect(bell()).not.toBeInTheDocument();
	});

	// No handler is how the screen says nobody is signed in: a dead bell would
	// be worse than none.
	it('draws no bell at all without a handler to hang it on', () => {
		render(
			<GameRow
				game={game({})}
				season={season}
				myResponse={undefined}
				now={now}
				onRespond={vi.fn()}
				onClear={vi.fn()}
			/>
		);

		expect(bell()).not.toBeInTheDocument();
	});
});
