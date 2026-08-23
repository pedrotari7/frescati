import { act, fireEvent, render, screen } from '@testing-library/react';
import type { TournamentTeam } from '@shared/types';
import PlayerTeamSheet from './PlayerTeamSheet';

const teams: TournamentTeam[] = [
	{ index: 0, uids: ['anna', 'pedro'] },
	{ index: 1, uids: ['sofia', 'kalle'] },
	{ index: 2, uids: ['bruno', 'lena'] },
];

const onMove = jest.fn();
const onClose = jest.fn();

// Headless UI settles its own transition state a microtask after mount, so an
// unflushed render logs an act warning from inside the library on every test.
const draw = async (currentIndex = 0, squads = teams) => {
	const view = render(
		<PlayerTeamSheet
			displayName='Anna Berg'
			teams={squads}
			currentIndex={currentIndex}
			open
			onClose={onClose}
			onMove={onMove}
		/>
	);
	await act(async () => {});

	return view;
};

const teamButton = (letter: string) => screen.getByRole('button', { name: new RegExp(`Team ${letter}`) });

describe('PlayerTeamSheet', () => {
	beforeEach(() => jest.clearAllMocks());

	it('asks about the player by name', async () => {
		await draw();

		expect(screen.getByText('Where is Anna Berg?')).toBeInTheDocument();
	});

	it('offers every squad on the sheet', async () => {
		await draw();

		expect(teamButton('A')).toBeInTheDocument();
		expect(teamButton('B')).toBeInTheDocument();
		expect(teamButton('C')).toBeInTheDocument();
	});

	// Kept in the list and marked rather than filtered out: seeing where they are
	// is the context for choosing where they go.
	it('marks the squad they are on and refuses to move them to it', async () => {
		await draw();

		expect(screen.getByText('Here now')).toBeInTheDocument();
		expect(teamButton('A')).toBeDisabled();
	});

	it('moves them and closes', async () => {
		await draw();

		await act(async () => {
			fireEvent.click(teamButton('B'));
		});

		expect(onMove).toHaveBeenCalledWith(1);
		expect(onClose).toHaveBeenCalled();
	});

	it('takes them off the sheet', async () => {
		await draw();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /Off the team sheet/ }));
		});

		expect(onMove).toHaveBeenCalledWith(null);
	});

	// There is nowhere to take them off from, and no move that isn't also an add.
	it('offers no way off the sheet for somebody who is not on it', async () => {
		await draw(-1);

		expect(screen.queryByRole('button', { name: /Off the team sheet/ })).not.toBeInTheDocument();
	});

	// An empty squad is a fixture against nobody, so `setPlayerTeam` refuses it,
	// and a button that would hit that refusal says why instead of failing.
	it('says why when they are the last one on their team', async () => {
		await draw(1, [
			{ index: 0, uids: ['anna', 'pedro'] },
			{ index: 1, uids: ['sofia'] },
		]);

		expect(screen.getByText(/a team with nobody on it/)).toBeInTheDocument();
		expect(teamButton('A')).toBeDisabled();
		expect(screen.getByRole('button', { name: /Off the team sheet/ })).toBeDisabled();
	});

	it('closes without moving anybody on Cancel', async () => {
		await draw();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		});

		expect(onClose).toHaveBeenCalled();
		expect(onMove).not.toHaveBeenCalled();
	});
});
