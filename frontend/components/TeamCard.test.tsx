import { render, screen } from '@testing-library/react';
import type { AppUser, TournamentTeam } from '@shared/types';
import { DEFAULT_NOTIFICATION_PREFS } from '@shared/types';
import { BASE_ELO } from '@shared/rating';
import TeamCard, { teamName } from './TeamCard';

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

describe('teamName', () => {
	it('names the first four teams A through D', () => {
		expect([0, 1, 2, 3].map(teamName)).toEqual(['A', 'B', 'C', 'D']);
	});

	it('falls back to a 1-indexed number past the known styles', () => {
		expect(teamName(4)).toBe('5');
	});
});

describe('TeamCard', () => {
	const team: TournamentTeam = { index: 0, uids: ['alice', 'bob'] };

	it('shows the squad average on the displayed 0-100 scale', () => {
		render(
			<TeamCard
				team={team}
				elos={{ alice: BASE_ELO, bob: BASE_ELO }}
				usersByUid={usersByUid}
				sideSize={2}
			/>
		);

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
		render(
			<TeamCard team={team} elos={{ alice: BASE_ELO, bob: BASE_ELO }} usersByUid={usersByUid} sideSize={2} />
		);

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
