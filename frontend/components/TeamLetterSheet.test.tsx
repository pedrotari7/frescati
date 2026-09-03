import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AppUser, TournamentTeam } from '@shared/types';
import { DEFAULT_NOTIFICATION_PREFS } from '@shared/types';
import TeamLetterSheet from './TeamLetterSheet';

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
	['anna', user('anna', 'Anna Berg')],
	['pedro', user('pedro', 'Pedro Alvito')],
	['sofia', user('sofia', 'Sofia Lund')],
	['kalle', user('kalle', 'Kalle Ek')],
	['bruno', user('bruno', 'Bruno Sá')],
]);

const teams: TournamentTeam[] = [
	{ index: 0, uids: ['anna', 'pedro'] },
	{ index: 1, uids: ['sofia', 'kalle', 'bruno'] },
];

const onSwap = vi.fn();
const onClose = vi.fn();

// Headless UI settles its own transition state a microtask after mount, so an
// unflushed render logs an act warning from inside the library on every test.
const draw = async (team: TournamentTeam | null = teams[1]) => {
	const view = render(
		<TeamLetterSheet
			team={team}
			teams={teams}
			usersByUid={usersByUid}
			open={!!team}
			onClose={onClose}
			onSwap={onSwap}
		/>
	);
	await act(async () => {});

	return view;
};

describe('TeamLetterSheet', () => {
	beforeEach(() => vi.clearAllMocks());

	// A letter on its own is not something anybody can pick between at the side
	// of a pitch. The decision is about who team A currently is.
	it('names the squad by a couple of first names rather than by its letter', async () => {
		await draw();

		expect(screen.getByText('Which team is Sofia, Kalle +1?')).toBeInTheDocument();
		expect(screen.getByText('Swaps with Anna, Pedro')).toBeInTheDocument();
	});

	it('marks the letter they have now and refuses to swap with it', async () => {
		await draw();

		expect(screen.getByText('Where they are now')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Team B/ })).toBeDisabled();
	});

	it('swaps with the squad that was picked, and closes', async () => {
		await draw();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /Team A/ }));
		});

		expect(onSwap).toHaveBeenCalledWith(0);
		expect(onClose).toHaveBeenCalled();
	});

	// The rotation always opens A against B, which is the whole reason this
	// screen exists, so the sheet has to say so rather than leaving a letter
	// looking like a name.
	it('explains that the first two teams kick off', async () => {
		await draw();

		expect(screen.getByText(/first two teams kick off/)).toBeInTheDocument();
	});

	it('closes without swapping anything on Cancel', async () => {
		await draw();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		});

		expect(onClose).toHaveBeenCalled();
		expect(onSwap).not.toHaveBeenCalled();
	});
});
