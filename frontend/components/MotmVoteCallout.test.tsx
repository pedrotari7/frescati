import * as stylex from '@stylexjs/stylex';
import { render, screen } from '@testing-library/react';
import type { AppUser, Game, MotmVote, Season, TournamentTeams } from '@shared/types';
import { tint } from '../app/tokens.stylex';
import { stylesFor, stylesOf } from '../test/stylex';
import MotmVoteCallout from './MotmVoteCallout';

/**
 * The card is three cards, and which one you get is the whole of what this
 * file pins. It asks only the people who played, and only until they answer.
 *
 * The two listeners behind that are mocked rather than driven, the same way
 * `SeasonProvider`'s are. What they return is the only input the stances differ
 * on, and a real `onSnapshot` in jsdom never delivers a first snapshot at all,
 * so every test would see the frame before anything has landed.
 */

const mockTeams = { teams: null as TournamentTeams | null, loading: false };
const mockVote = { vote: null as MotmVote | null, loading: false };
const mockUsers = {
	usersByUid: new Map<string, AppUser>([['johan', { uid: 'johan', displayName: 'Johan' } as AppUser]]),
};
const mockAuth = { user: { uid: 'anna' } as { uid: string } | null };

vi.mock('../hooks/useData', () => ({
	useTournamentTeams: () => mockTeams,
	useMyMotmVote: () => mockVote,
	useUsersByUid: () => mockUsers,
}));

vi.mock('../lib/auth', () => ({ useAuth: () => mockAuth }));

/* The wash the card takes while the question is out to the person reading it. */
const expected = stylex.create({ live: { backgroundColor: tint.pending8 } });

const season = {
	id: 'season-1',
	slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'UTC' },
} as Season;

const NOW = new Date('2026-09-02T12:00:00.000Z');

const game = (overrides: Partial<Game> = {}): Game =>
	({
		id: 'game-1',
		kickoff: '2026-09-01T17:00:00.000Z',
		endsAt: '2026-09-01T18:30:00.000Z',
		status: 'played',
		motmVotingUntilMillis: NOW.getTime() + 24 * 3_600_000,
		...overrides,
	}) as Game;

const lineup = (...uids: string[]) => ({ teams: [{ index: 0, uids }] }) as TournamentTeams;

const renderCallout = (overrides: Partial<Game> = {}) =>
	render(<MotmVoteCallout game={game(overrides)} season={season} now={NOW} />);

const card = (container: HTMLElement) => container.firstElementChild;

beforeEach(() => {
	mockTeams.teams = lineup('anna', 'johan');
	mockTeams.loading = false;
	mockVote.vote = null;
	mockVote.loading = false;
	mockAuth.user = { uid: 'anna' };
});

describe('MotmVoteCallout', () => {
	it('says which game it is about, and how long is left to answer', () => {
		renderCallout();

		expect(screen.getByRole('heading', { name: 'Tuesday 1 Sep' })).toBeInTheDocument();
		expect(screen.getByText(/Closes tomorrow/)).toBeInTheDocument();
	});

	it('asks somebody who played and has not voted, and says so in colour', () => {
		const { container } = renderCallout();

		expect(screen.getByRole('link', { name: 'Vote' })).toHaveAttribute('href', '/s/season-1/g/game-1/tournament');
		expect(stylesOf(card(container))).toEqual(expect.arrayContaining(stylesFor(expected.live)));
	});

	// The point of the wash is that it comes off. A card still shouting at
	// somebody who has already answered is one they learn to scroll past.
	it('names who you picked once you have voted, and drops the colour', () => {
		mockVote.vote = { uid: 'anna', votedFor: 'johan', votedAt: '2026-09-02T09:00:00.000Z' };

		const { container } = renderCallout();

		expect(screen.getByText(/You voted for/)).toHaveTextContent('You voted for Johan.');
		expect(screen.getByRole('link', { name: 'Change your vote' })).toBeInTheDocument();
		expect(stylesOf(card(container))).not.toEqual(expect.arrayContaining(stylesFor(expected.live)));
	});

	// A game is public to the whole group, so somebody who wasn't in the lineup
	// sees the vote announced and nothing addressed to them, which is the same
	// answer `MotmPanel` gives them one tap further in.
	it('asks nothing of somebody who did not play', () => {
		mockTeams.teams = lineup('johan', 'zara');

		const { container } = renderCallout();

		expect(screen.getByText(/The players are voting/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'See the team sheet' })).toBeInTheDocument();
		expect(stylesOf(card(container))).not.toEqual(expect.arrayContaining(stylesFor(expected.live)));
	});

	// Asking somebody who has already voted to vote, for the frame before their
	// vote arrives, is the wrong way round to be wrong.
	it('claims neither stance until both listeners have landed', () => {
		mockVote.loading = true;

		const { container } = renderCallout();

		expect(screen.getByRole('heading', { name: 'Tuesday 1 Sep' })).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Vote' })).not.toBeInTheDocument();
		expect(stylesOf(card(container))).not.toEqual(expect.arrayContaining(stylesFor(expected.live)));
	});

	it('draws nothing for a game whose vote is shut', () => {
		const { container } = renderCallout({ motmVotingUntilMillis: undefined });

		expect(container).toBeEmptyDOMElement();
	});

	it('draws nothing once the deadline has gone by', () => {
		const { container } = renderCallout({ motmVotingUntilMillis: NOW.getTime() - 1 });

		expect(container).toBeEmptyDOMElement();
	});
});
