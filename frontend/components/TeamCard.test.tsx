import { fireEvent, render, screen } from '@testing-library/react';
import type { AppUser, TournamentTeam } from '@shared/types';
import { DEFAULT_NOTIFICATION_PREFS } from '@shared/types';
import { BASE_ELO } from '@shared/rating';
import TeamCard from './TeamCard';

const user = (uid: string, displayName: string): AppUser => ({
	uid,
	displayName,
	photoURL: null,
	createdAt: '2026-01-01T00:00:00.000Z',
	lastSeenAt: '2026-01-01T00:00:00.000Z',
	isAppAdmin: false,
	notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
});

const usersByUid = new Map([
	['alice', user('alice', 'Alice Ng')],
	['bob', user('bob', 'Bob Lee')],
	['carol', user('carol', 'Carol Diaz')],
]);

describe('TeamCard', () => {
	const team: TournamentTeam = { index: 0, uids: ['alice', 'bob'] };

	it('names the team beside its badge', () => {
		render(<TeamCard team={team} elos={{}} usersByUid={usersByUid} sideSize={2} />);

		expect(screen.getByText('Team A')).toBeInTheDocument();
		expect(screen.getByText('A')).toBeInTheDocument();
	});

	it('shows the squad average on the displayed 0-100 scale', () => {
		render(<TeamCard team={team} elos={{ alice: BASE_ELO, bob: BASE_ELO }} usersByUid={usersByUid} sideSize={2} />);

		expect(screen.getByText('avg 50')).toBeInTheDocument();
	});

	it('lists every squad member by full name with their rating', () => {
		render(
			<TeamCard
				team={team}
				elos={{ alice: BASE_ELO, bob: BASE_ELO + 250 }}
				usersByUid={usersByUid}
				sideSize={2}
			/>
		);

		expect(screen.getByText('Alice Ng')).toBeInTheDocument();
		expect(screen.getByText('Bob Lee')).toBeInTheDocument();
		expect(screen.getByText('50')).toBeInTheDocument();
		expect(screen.getByText('100')).toBeInTheDocument();
	});

	it('falls back to a placeholder name for a uid missing from the user map', () => {
		render(<TeamCard team={{ index: 0, uids: ['ghost'] }} elos={{}} usersByUid={usersByUid} sideSize={1} />);

		expect(screen.getByText('Unknown player')).toBeInTheDocument();
	});

	it('names the rotating surplus when the squad is bigger than the side', () => {
		render(
			<TeamCard
				team={{ index: 0, uids: ['alice', 'bob', 'carol'] }}
				elos={{ alice: BASE_ELO, bob: BASE_ELO, carol: BASE_ELO }}
				usersByUid={usersByUid}
				sideSize={2}
			/>
		);

		expect(screen.getByText('2 on the pitch · 1 rotating')).toBeInTheDocument();
	});

	it('says nothing about rotation when the whole squad plays at once', () => {
		render(<TeamCard team={team} elos={{ alice: BASE_ELO, bob: BASE_ELO }} usersByUid={usersByUid} sideSize={2} />);

		expect(screen.queryByText(/rotating/)).not.toBeInTheDocument();
	});

	it('shows rating movement once the game has been confirmed', () => {
		render(
			<TeamCard
				team={team}
				elos={{ alice: BASE_ELO + 30, bob: BASE_ELO }}
				usersByUid={usersByUid}
				sideSize={2}
				deltas={new Map([['alice', 30]])}
			/>
		);

		expect(screen.getByText('+6')).toBeInTheDocument();
	});

	// The squad average is drawn from the ratings we hold, and a missing one is
	// not a zero: counting it as one dragged the whole badge down by whatever
	// share of the squad that player was.
	it('prices a player we hold no rating for as unknown, and leaves them out of the average', () => {
		render(<TeamCard team={team} elos={{ alice: BASE_ELO }} usersByUid={usersByUid} sideSize={2} />);

		expect(screen.getByText('–')).toBeInTheDocument();
		expect(screen.getByText('avg 50')).toBeInTheDocument();
	});

	it('shows no average at all for a squad we can price nobody on', () => {
		render(<TeamCard team={team} elos={{}} usersByUid={usersByUid} sideSize={2} />);

		expect(screen.queryByText(/^avg /)).not.toBeInTheDocument();
	});

	describe('with a season admin looking at it', () => {
		it('offers no way to move anybody by default', () => {
			render(<TeamCard team={team} elos={{}} usersByUid={usersByUid} sideSize={2} />);

			expect(screen.queryByRole('button', { name: /Move/ })).not.toBeInTheDocument();
		});

		it('leaves the team identity as plain text with no way to reletter it', () => {
			render(<TeamCard team={team} elos={{}} usersByUid={usersByUid} sideSize={2} />);

			expect(screen.queryByRole('button', { name: /Change which team/ })).not.toBeInTheDocument();
			expect(screen.queryByText(/tap to swap/)).not.toBeInTheDocument();
		});

		// The letter is the biggest thing on the card and the thing being
		// changed, so it is the target rather than a control of its own.
		it('opens the letter sheet from the badge and the team name', () => {
			const onChangeLetter = jest.fn();

			render(
				<TeamCard team={team} elos={{}} usersByUid={usersByUid} sideSize={2} onChangeLetter={onChangeLetter} />
			);

			fireEvent.click(screen.getByRole('button', { name: 'Change which team A is' }));

			expect(onChangeLetter).toHaveBeenCalled();
		});

		it('opens the move sheet for the player whose button was tapped', () => {
			const onMovePlayer = jest.fn();

			render(<TeamCard team={team} elos={{}} usersByUid={usersByUid} sideSize={2} onMovePlayer={onMovePlayer} />);

			fireEvent.click(screen.getByRole('button', { name: 'Move Bob Lee to another team' }));

			expect(onMovePlayer).toHaveBeenCalledWith('bob');
		});

		// `setPlayerTeam` refuses to leave a team with nobody on it, and that
		// covers taking them off the sheet — so the move sheet would open with
		// every control greyed and only Cancel live.
		it('refuses to offer a move for the only player on a squad', () => {
			const onMovePlayer = jest.fn();

			render(
				<TeamCard
					team={{ index: 0, uids: ['alice'] }}
					elos={{}}
					usersByUid={usersByUid}
					sideSize={1}
					onMovePlayer={onMovePlayer}
				/>
			);

			const move = screen.getByRole('button', {
				name: 'Alice Ng is the only player on team A, so there is nowhere to move them',
			});

			expect(move).toBeDisabled();

			fireEvent.click(move);

			expect(onMovePlayer).not.toHaveBeenCalled();
		});
	});

	// Only reachable on a hand-picked lineup, which stops being re-picked — so
	// the sheet outlives somebody's answer and a squad is quietly a man short.
	it('marks somebody on the sheet who has since dropped out', () => {
		render(
			<TeamCard
				team={team}
				elos={{ alice: BASE_ELO, bob: BASE_ELO }}
				usersByUid={usersByUid}
				sideSize={2}
				notPlaying={new Set(['bob'])}
			/>
		);

		expect(screen.getByText('Out')).toBeInTheDocument();
		expect(screen.getByText('Bob Lee')).toHaveClass('line-through');
		expect(screen.getByText('Alice Ng')).not.toHaveClass('line-through');
	});

	// The team sheet is the one screen in a position to say a squad played a man
	// down, which is the thing a no-show actually costs.
	it('marks somebody reported as a no-show', () => {
		render(
			<TeamCard
				team={team}
				elos={{ alice: BASE_ELO, bob: BASE_ELO }}
				usersByUid={usersByUid}
				sideSize={2}
				absentUids={new Set(['alice'])}
			/>
		);

		expect(screen.getByText('No-show')).toBeInTheDocument();
		expect(screen.getByText('Alice Ng')).toHaveClass('line-through');
	});

	// One is a report about somebody, the other a disagreement between the sheet
	// and the pool. Both at once is a row with two contradictory pills on it.
	it('prefers the no-show over a bare dropped-out mark', () => {
		render(
			<TeamCard
				team={team}
				elos={{ alice: BASE_ELO, bob: BASE_ELO }}
				usersByUid={usersByUid}
				sideSize={2}
				notPlaying={new Set(['alice'])}
				absentUids={new Set(['alice'])}
			/>
		);

		expect(screen.getByText('No-show')).toBeInTheDocument();
		expect(screen.queryByText('Out')).not.toBeInTheDocument();
	});

	it('shows no movement badge for a delta that rounds to zero', () => {
		render(
			<TeamCard
				team={team}
				elos={{ alice: BASE_ELO, bob: BASE_ELO }}
				usersByUid={usersByUid}
				sideSize={2}
				deltas={new Map([['alice', 1]])}
			/>
		);

		expect(screen.queryByText(/^[+-]\d+$/)).not.toBeInTheDocument();
	});
});
