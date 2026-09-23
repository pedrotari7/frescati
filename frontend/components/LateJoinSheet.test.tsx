import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AppUser, Game, Season } from '@shared/types';
import LateJoinSheet from './LateJoinSheet';

const user = { uid: 'erik', displayName: 'Erik' } as AppUser;

const season = {
	id: 's1',
	slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'Europe/Stockholm' },
	fees: { total: 2000, perGame: 70 },
	memberUids: ['anna', 'bo', 'cid'],
	adminUids: ['anna'],
} as unknown as Season;

// Five Tuesdays in September, 19:00 Stockholm.
const games = ['01', '08', '15', '22', '29'].map(
	day => ({ id: `g${day}`, kickoff: `2026-09-${day}T17:00:00.000Z`, status: 'scheduled' }) as Game
);

const onAdd = vi.fn();
const onClose = vi.fn();

const draw = async (on: string, list: Game[] = games) => {
	vi.setSystemTime(new Date(`${on}T10:00:00.000Z`));
	render(<LateJoinSheet user={user} season={season} games={list} onClose={onClose} onAdd={onAdd} />);
	await act(async () => {});
};

describe('LateJoinSheet', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers({ toFake: ['Date'] });
	});

	afterEach(() => vi.useRealTimers());

	it('starts on today and charges the share for the games left', async () => {
		await draw('2026-09-15');

		// 2000 across the four of them is 500, and 3 of 5 games are left.
		expect(screen.getByText('3 of 5 games left, so 300 kr of the 500 kr share.')).toBeInTheDocument();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Add and charge 300 kr' }));
		});

		expect(onAdd).toHaveBeenCalledWith(user, { amount: 300, note: 'Joined Tue 15 Sep, 3 of 5 games' });
		expect(onClose).toHaveBeenCalled();
	});

	it('charges nothing once the last game has gone', async () => {
		await draw('2026-09-30');

		expect(screen.getByText('No games left from that day, so there is nothing to charge.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
	});
});
