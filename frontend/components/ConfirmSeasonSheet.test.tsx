import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AppUser, Season } from '@shared/types';
import ConfirmSeasonSheet from './ConfirmSeasonSheet';

const mockConfirmSeason = vi.fn();
const mockNotify = vi.fn();

vi.mock('../lib/db/signups', () => ({
	confirmSeason: (...args: unknown[]) => mockConfirmSeason(...args),
}));

vi.mock('./Toast', () => ({
	useToast: () => ({ notify: mockNotify, warn: vi.fn() }),
}));

const people = new Map<string, AppUser>(
	['a', 'b', 'd'].map(uid => [uid, { uid, displayName: `Player ${uid}`, photoURL: null } as AppUser])
);

const season = {
	id: 'season-1',
	name: 'Autumn 2026',
	adminUids: ['a', 'd'],
	fees: { total: 3000, perGame: 0 },
} as Season;

const draw = async (yesUids: string[], onClose = vi.fn()) => {
	render(<ConfirmSeasonSheet open onClose={onClose} season={season} yesUids={yesUids} usersByUid={people} />);
	await act(async () => {});
};

describe('ConfirmSeasonSheet', () => {
	beforeEach(() => vi.clearAllMocks());

	it('repeats the count and the share', async () => {
		await draw(['a', 'b']);

		expect(screen.getByText(/2 players/)).toBeInTheDocument();
		expect(screen.getByText(/Each owes 1 500 kr/)).toBeInTheDocument();
	});

	it('names the admins who would lose the role for not saying yes', async () => {
		await draw(['a']);

		expect(screen.getByText(/Player d/)).toBeInTheDocument();
		expect(screen.queryByText(/Player a(?!\w)/)).not.toBeInTheDocument();
	});

	it('says nothing about admins when all of them are in', async () => {
		await draw(['a', 'd']);

		expect(screen.queryByText(/stop being admins/)).not.toBeInTheDocument();
	});

	it('confirms and toasts the result', async () => {
		mockConfirmSeason.mockResolvedValue({ members: 2, share: 1500, demoted: [] });
		const onClose = vi.fn();
		await draw(['a', 'b'], onClose);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Confirm season' }));
		});

		expect(mockConfirmSeason).toHaveBeenCalledWith('season-1');
		expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining('2 members'));
		expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining('1 500 kr'));
		expect(onClose).toHaveBeenCalled();
	});
});
