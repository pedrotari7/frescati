import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Season, Signup } from '@shared/types';
import SignupCard from './SignupCard';

const mockSetSignup = vi.fn();
const mockClearSignup = vi.fn();

vi.mock('../lib/db/signups', () => ({
	setSignup: (...args: unknown[]) => mockSetSignup(...args),
	clearSignup: (...args: unknown[]) => mockClearSignup(...args),
}));

vi.mock('./Toast', () => ({
	useToast: () => ({ notify: vi.fn(), warn: vi.fn() }),
}));

const season = (overrides: Partial<Season> = {}) =>
	({
		id: 'next',
		name: 'Spring 2027',
		status: 'draft',
		startDate: '2027-03-02',
		endDate: '2027-06-01',
		venue: { name: 'Frescati IP' },
		slot: { weekday: 2, time: '19:00', durationMinutes: 60, timezone: 'Europe/Stockholm' },
		...overrides,
	}) as Season;

const answer = (status: Signup['status']): Signup => ({
	uid: 'me',
	status,
	answeredAt: '2026-11-22T10:00:00.000Z',
	updatedAt: '2026-11-22T10:00:00.000Z',
});

const draw = (props: { season?: Season; signup?: Signup; yesCount?: number } = {}) =>
	render(
		<SignupCard season={props.season ?? season()} signup={props.signup} yesCount={props.yesCount ?? 0} uid='me' />
	);

describe('SignupCard', () => {
	beforeEach(() => vi.clearAllMocks());

	it('asks with both buttons when there is no answer yet, and Join says yes', async () => {
		mockSetSignup.mockResolvedValue(undefined);
		draw();

		expect(screen.getByText('Spring 2027')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Not this time' })).toBeInTheDocument();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Join' }));
		});

		expect(mockSetSignup).toHaveBeenCalledWith('next', 'me', 'yes');
	});

	it('says no with Not this time', async () => {
		mockSetSignup.mockResolvedValue(undefined);
		draw();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Not this time' }));
		});

		expect(mockSetSignup).toHaveBeenCalledWith('next', 'me', 'no');
	});

	it('folds to one line once answered, and Change brings both buttons back', () => {
		draw({ signup: answer('no') });

		expect(screen.getByText('You said not this time')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'Change' }));

		expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Not this time' })).toBeInTheDocument();
	});

	it('says you are in when the answer is yes', () => {
		draw({ signup: answer('yes') });

		expect(screen.getByText("You're in")).toBeInTheDocument();
	});

	it('shows the share so far when the season has a fee', () => {
		draw({ season: season({ fees: { total: 1000, perGame: 0 } }), yesCount: 3 });

		expect(screen.getByText(/334 kr/)).toBeInTheDocument();
	});

	it('shows no amount without a fee or without yeses', () => {
		draw({ yesCount: 3 });
		expect(screen.queryByText(/kr/)).not.toBeInTheDocument();
	});

	it('shows no amount when nobody has said yes yet', () => {
		draw({ season: season({ fees: { total: 1000, perGame: 0 } }), yesCount: 0 });
		expect(screen.queryByText(/kr/)).not.toBeInTheDocument();
	});
});
