import { fireEvent, render, screen } from '@testing-library/react';
import type { AppUser, MotmVote, TournamentMotm } from '@shared/types';
import MotmPanel from './MotmPanel';

const user = (uid: string, displayName: string): AppUser =>
	({ uid, displayName, photoURL: null }) as unknown as AppUser;

const USERS = new Map([
	['anna', user('anna', 'Anna')],
	['johan', user('johan', 'Johan')],
	['zara', user('zara', 'Zara')],
	['erik', user('erik', 'Erik')],
]);

const TEAMS = [
	{ index: 0, uids: ['anna', 'johan'] },
	{ index: 1, uids: ['zara', 'erik'] },
];

const NOW = new Date('2026-09-02T12:00:00.000Z');
const OPEN_UNTIL = NOW.getTime() + 24 * 3_600_000;

const decided = (winners: string[], counts: TournamentMotm['counts']): TournamentMotm => ({
	winners,
	counts,
	decidedAt: '2026-09-04T12:00:00.000Z',
});

const vote = (votedFor: string): MotmVote => ({ uid: 'anna', votedFor, votedAt: '2026-09-02T09:00:00.000Z' });

const renderPanel = (props: Partial<React.ComponentProps<typeof MotmPanel>> = {}) =>
	render(
		<MotmPanel
			teams={TEAMS}
			usersByUid={USERS}
			motm={null}
			vote={null}
			voterUids={[]}
			votingUntil={OPEN_UNTIL}
			now={NOW}
			canVote
			onVote={jest.fn()}
			{...props}
		/>
	);

describe('MotmPanel', () => {
	// A game nobody has confirmed has not asked anybody anything yet, and an
	// empty trophy would promise a vote that isn't coming.
	it('draws nothing at all before the vote has been opened', () => {
		const { container } = renderPanel({ votingUntil: undefined });

		expect(container).toBeEmptyDOMElement();
	});

	it('offers everybody who played, both teams', () => {
		renderPanel();

		for (const name of ['Anna', 'Johan', 'Zara', 'Erik']) {
			expect(screen.getByRole('button', { name: new RegExp(name) })).toBeEnabled();
		}
	});

	// Deliberate: a rule against it is one more thing to go wrong for the player
	// who genuinely was the best one out there.
	it('lets somebody vote for themselves', () => {
		const onVote = jest.fn();
		renderPanel({ onVote });

		fireEvent.click(screen.getByRole('button', { name: /Anna/ }));

		expect(onVote).toHaveBeenCalledWith('anna');
	});

	it('marks the name you picked', () => {
		renderPanel({ vote: vote('zara') });

		expect(screen.getByRole('button', { name: /Zara/ })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('button', { name: /Anna/ })).toHaveAttribute('aria-pressed', 'false');
	});

	// The whole reason nobody else's vote is readable: a visible lead is a lead
	// people vote for.
	it('shows no count of any kind while the vote is open', () => {
		renderPanel({ vote: vote('zara') });

		expect(screen.queryByText(/votes/)).not.toBeInTheDocument();
		expect(screen.getByText(/nobody sees the count until it closes/i)).toBeInTheDocument();
	});

	// The game is public to the whole group, so somebody who wasn't on the pitch
	// sees the same panel. Buttons that fail on write would be worse.
	it('leaves the names unclickable for somebody who did not play', () => {
		renderPanel({ canVote: false });

		expect(screen.getByRole('button', { name: /Anna/ })).toBeDisabled();
		expect(screen.getByText(/The players are voting/)).toBeInTheDocument();
	});

	it('says when it closes', () => {
		renderPanel();

		expect(screen.getByText(/Closes tomorrow|Closes in \d+ hours/)).toBeInTheDocument();
	});

	// Turnout is not a tally. Every test here is the same pair of claims: that the
	// panel says who has answered, and that it still says nothing about what any
	// of them answered.
	describe('the turnout while it is open', () => {
		const voted = (name: string) => screen.getByRole('listitem', { name: `${name} — voted` });
		const notYet = (name: string) => screen.getByRole('listitem', { name: `${name} — not yet` });

		it('says how many of the lineup have voted', () => {
			renderPanel({ voterUids: ['anna', 'zara'] });

			expect(screen.getByText('2 of 4 voted')).toBeInTheDocument();
		});

		it('marks who has answered and who has not, without saying what they said', () => {
			renderPanel({ voterUids: ['anna', 'zara'] });

			expect(voted('Anna')).toBeInTheDocument();
			expect(voted('Zara')).toBeInTheDocument();
			expect(notYet('Johan')).toBeInTheDocument();
			expect(notYet('Erik')).toBeInTheDocument();
		});

		// The document behind this carries uids and no picks at all, so there is
		// nothing for the panel to leak — this pins that it stays that way.
		it('still shows no count of who is leading', () => {
			renderPanel({ voterUids: ['anna', 'zara'], vote: vote('erik') });

			expect(screen.queryByText(/votes/)).not.toBeInTheDocument();
		});

		it('reads as nobody rather than zero before the first vote', () => {
			renderPanel({ voterUids: [] });

			expect(screen.getByText('Nobody has voted yet')).toBeInTheDocument();
			expect(notYet('Anna')).toBeInTheDocument();
		});

		it('says so when the whole lineup has answered', () => {
			renderPanel({ voterUids: ['anna', 'johan', 'zara', 'erik'] });

			expect(screen.getByText('Everybody has voted')).toBeInTheDocument();
		});

		// Somebody who never played cannot vote — rules check the team sheet at
		// both ends — but the two halves on screen must sum to the lineup anyway.
		it('counts against the lineup rather than against the votes stored', () => {
			renderPanel({ voterUids: ['anna', 'ghost'] });

			expect(screen.getByText('1 of 4 voted')).toBeInTheDocument();
		});
	});

	describe('once it is decided', () => {
		it('names the winner and publishes the counts', () => {
			renderPanel({
				motm: decided(
					['zara'],
					[
						{ uid: 'zara', votes: 3 },
						{ uid: 'anna', votes: 1 },
					]
				),
				votingUntil: undefined,
			});

			// Twice: announced as the result, and still in the list underneath it
			// — which is where the counts hang.
			expect(screen.getAllByText('Zara')).toHaveLength(2);
			expect(screen.getByText('3 of 4 votes')).toBeInTheDocument();
			expect(screen.getByText('Decided')).toBeInTheDocument();
		});

		// The ballot was in team order because there was nothing to rank by. A
		// result is ranked, and everybody level keeps the order they were drawn
		// in — including the tail nobody voted for.
		it('reorders the list by votes, most first', () => {
			renderPanel({
				motm: decided(
					['erik'],
					[
						{ uid: 'erik', votes: 3 },
						{ uid: 'johan', votes: 1 },
					]
				),
				votingUntil: undefined,
			});

			const order = screen
				.getAllByRole('button')
				.map(button => [...USERS.values()].find(u => button.textContent?.includes(u.displayName))?.uid);

			expect(order).toEqual(['erik', 'johan', 'anna', 'zara']);
		});

		// A tie is stated as a tie rather than resolved — the group produced two
		// names, and they share the bonus.
		it('names both when the vote tied', () => {
			renderPanel({
				motm: decided(
					['anna', 'zara'],
					[
						{ uid: 'anna', votes: 2 },
						{ uid: 'zara', votes: 2 },
					]
				),
				votingUntil: undefined,
			});

			expect(screen.getByText('Anna & Zara')).toBeInTheDocument();
			expect(screen.getByText(/shared/)).toBeInTheDocument();
		});

		it('says so plainly when nobody voted', () => {
			renderPanel({ motm: decided([], []), votingUntil: undefined });

			expect(screen.getByText(/Nobody voted/)).toBeInTheDocument();
		});

		// The turnout is the sum of the published totals from here on, and the
		// document behind the strip is deleted with the window.
		it('drops the turnout strip, which the totals now carry', () => {
			renderPanel({ motm: decided(['zara'], [{ uid: 'zara', votes: 1 }]), votingUntil: undefined });

			expect(screen.queryByRole('listitem', { name: /voted|not yet/ })).not.toBeInTheDocument();
		});

		it('stops taking votes', () => {
			const onVote = jest.fn();
			renderPanel({ motm: decided(['zara'], [{ uid: 'zara', votes: 1 }]), votingUntil: undefined, onVote });

			expect(screen.getByRole('button', { name: /Anna/ })).toBeDisabled();
		});

		// A window that has run out but hasn't been counted yet — the hour
		// between the deadline and the sweep. Nothing to announce, and nothing
		// left to vote on.
		it('stops taking votes the moment the deadline passes, before the count', () => {
			renderPanel({ votingUntil: NOW.getTime() - 1_000, motm: null });

			expect(screen.queryByRole('button', { name: /Anna/ })).not.toBeInTheDocument();
		});
	});
});
