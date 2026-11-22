import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { AppUser, Season, Signup } from '@shared/types';
import SignupAdmin from './SignupAdmin';

const mockSetSignup = vi.fn().mockResolvedValue(undefined);
const mockClearSignup = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/db/signups', () => ({
	setSignup: (...args: unknown[]) => mockSetSignup(...args),
	clearSignup: (...args: unknown[]) => mockClearSignup(...args),
	confirmSeason: vi.fn(),
}));

vi.mock('./Toast', () => ({
	useToast: () => ({ notify: vi.fn(), warn: vi.fn() }),
}));

const user = (uid: string): AppUser => ({ uid, displayName: `Player ${uid}`, photoURL: null }) as AppUser;

const signup = (uid: string, status: 'yes' | 'no'): Signup => ({
	uid,
	status,
	answeredAt: '2026-11-01T10:00:00Z',
	updatedAt: '2026-11-01T10:00:00Z',
});

const season = (overrides: Partial<Season> = {}): Season =>
	({
		id: 'season-1',
		name: 'Autumn 2026',
		status: 'draft',
		memberUids: [],
		adminUids: ['a'],
		fees: { total: 3000, perGame: 0 },
		...overrides,
	}) as Season;

const draw = async (signups: Signup[], viewerUid = 'a', seasonOverrides: Partial<Season> = {}) => {
	render(
		<SignupAdmin
			seasonId='season-1'
			season={season(seasonOverrides)}
			users={[user('a'), user('b'), user('c')]}
			signups={signups}
			viewerUid={viewerUid}
		/>
	);
	await act(async () => {});
};

const group = (name: string) => screen.getByRole('region', { name });

describe('SignupAdmin', () => {
	beforeEach(() => vi.clearAllMocks());

	it('puts each person in the group their answer belongs to', async () => {
		await draw([signup('a', 'yes'), signup('b', 'no')]);

		expect(within(group('Joining')).getByText('Player a')).toBeInTheDocument();
		expect(within(group('Not joining')).getByText('Player b')).toBeInTheDocument();
		expect(within(group('No answer')).getByText('Player c')).toBeInTheDocument();
		expect(within(group('Joining')).queryByText('Player c')).not.toBeInTheDocument();
	});

	it('says how many are joining and what each would owe', async () => {
		await draw([signup('a', 'yes'), signup('b', 'yes')]);

		expect(screen.getByText(/2 joining/)).toBeInTheDocument();
		expect(screen.getByText(/1 500 kr each/)).toBeInTheDocument();
	});

	it('disables confirming until the viewing admin has said yes, and says why', async () => {
		await draw([signup('b', 'yes')]);

		expect(screen.getByRole('button', { name: 'Confirm season' })).toBeDisabled();
		expect(screen.getByText(/Say yes yourself first/)).toBeInTheDocument();
	});

	it('enables confirming once the viewing admin is in', async () => {
		await draw([signup('a', 'yes')]);

		expect(screen.getByRole('button', { name: 'Confirm season' })).toBeEnabled();
		expect(screen.queryByText(/Say yes yourself first/)).not.toBeInTheDocument();
	});

	it('records an answer for somebody else under the admin uid', async () => {
		await draw([]);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Answer for Player c' }));
		});
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: "They're in" }));
		});

		expect(mockSetSignup).toHaveBeenCalledWith('season-1', 'c', 'yes', 'a');
	});

	it('takes an answer away with a delete', async () => {
		await draw([signup('b', 'no')]);

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Answer for Player b' }));
		});
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Back to no answer' }));
		});

		expect(mockClearSignup).toHaveBeenCalledWith('season-1', 'b');
	});
});
