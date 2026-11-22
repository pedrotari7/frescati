import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Season } from '@shared/types';

const mockReplace = vi.fn();
const mockCreateSeason = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace }) }));
vi.mock('../lib/db/seasons', () => ({ createSeason: (...args: unknown[]) => mockCreateSeason(...args) }));
vi.mock('../lib/sentry', () => ({ captureError: vi.fn() }));

import NewSeasonForm from './NewSeasonForm';

const season = (id: string, name: string, startDate: string, endDate: string): Season => ({
	id,
	name,
	status: 'archived',
	startDate,
	endDate,
	venue: { name: 'Frescati IP' },
	slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'Europe/Stockholm' },
	minPlayers: 12,
	responseDeadlineHours: 24,
	reminderHours: [72, 24],
	fees: { total: 31240, perGame: 100 },
	memberUids: ['me', 'ana'],
	adminUids: ['me', 'ana'],
	createdAt: '2026-01-01T00:00:00.000Z',
	createdBy: 'me',
});

const AUTUMN = season('autumn', 'Autumn 2026', '2026-08-25', '2026-12-15');
const SPRING = season('spring', 'Spring 2026', '2026-02-03', '2026-06-09');

beforeEach(() => {
	vi.clearAllMocks();
	mockCreateSeason.mockResolvedValue('new1');
});

describe('NewSeasonForm', () => {
	it('preselects the season named in the link and offers no blank start to a season admin', () => {
		render(<NewSeasonForm sources={[AUTUMN, SPRING]} preferredId='spring' blankAllowed={false} uid='me' />);

		expect(screen.getByRole('combobox', { name: /copy from/i })).toHaveValue('spring');
		expect(screen.queryByText('Start blank')).not.toBeInTheDocument();
	});

	it('preselects the newest season when the link names none, and lets an app admin start blank', () => {
		render(<NewSeasonForm sources={[AUTUMN, SPRING]} preferredId={null} blankAllowed uid='me' />);

		expect(screen.getByRole('combobox', { name: /copy from/i })).toHaveValue('autumn');
		expect(screen.getByText('Start blank')).toBeInTheDocument();
	});

	it('creates a draft with no members that names its source', async () => {
		render(<NewSeasonForm sources={[AUTUMN]} preferredId='autumn' blankAllowed={false} uid='me' />);

		fireEvent.change(screen.getByPlaceholderText('Autumn 2026'), { target: { value: 'Spring 2027' } });
		fireEvent.click(screen.getByRole('button', { name: 'Create season' }));

		await waitFor(() => expect(mockCreateSeason).toHaveBeenCalledTimes(1));

		expect(mockCreateSeason.mock.calls[0][0]).toMatchObject({
			name: 'Spring 2027',
			status: 'draft',
			memberUids: [],
			copiedFrom: 'autumn',
			adminUids: ['me', 'ana'],
			fees: { total: 31240, perGame: 100 },
			startDate: '2026-12-22',
		});
		expect(mockCreateSeason.mock.calls[0][0]).not.toHaveProperty('quiet');
		expect(mockCreateSeason.mock.calls[0][0]).not.toHaveProperty('signupClosesOn');
		expect(mockReplace).toHaveBeenCalledWith('/s/new1/admin');
	});

	it('marks the season quiet when the switch is on', async () => {
		render(<NewSeasonForm sources={[AUTUMN]} preferredId='autumn' blankAllowed={false} uid='me' />);

		fireEvent.change(screen.getByPlaceholderText('Autumn 2026'), { target: { value: 'Spring 2027' } });
		fireEvent.click(screen.getByRole('switch'));
		fireEvent.click(screen.getByRole('button', { name: 'Create season' }));

		await waitFor(() => expect(mockCreateSeason).toHaveBeenCalled());

		expect(mockCreateSeason.mock.calls[0][0]).toMatchObject({ quiet: true });
	});

	it('clears the name and refills the dates when another source is picked', () => {
		render(<NewSeasonForm sources={[AUTUMN, SPRING]} preferredId='autumn' blankAllowed uid='me' />);

		fireEvent.change(screen.getByPlaceholderText('Autumn 2026'), { target: { value: 'Typed' } });
		fireEvent.change(screen.getByRole('combobox', { name: /copy from/i }), { target: { value: '' } });

		expect(screen.getByPlaceholderText('Autumn 2026')).toHaveValue('');
		expect(screen.queryByText(/Also copied/)).not.toBeInTheDocument();
	});

	it('shows the settings it copies without asking for them', () => {
		render(<NewSeasonForm sources={[AUTUMN]} preferredId='autumn' blankAllowed={false} uid='me' />);

		expect(screen.getByText(/31 240 kr/)).toBeInTheDocument();
		expect(screen.getByText(/1 other admin\b/)).toBeInTheDocument();
	});
});
