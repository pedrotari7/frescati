import { render, screen } from '@testing-library/react';
import type { Season } from '@shared/types';
import SignupQuestions from './SignupQuestions';

const drafts: Season[] = [];

vi.mock('../hooks/useData', () => ({
	useSignups: () => ({ signups: [] }),
	useDraftSeasons: () => drafts,
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));
vi.mock('../lib/db/signups', () => ({ setSignup: vi.fn(), clearSignup: vi.fn() }));
vi.mock('./Toast', () => ({ useToast: () => ({ notify: vi.fn(), warn: vi.fn() }) }));

const draft = (id: string, name: string) =>
	({
		id,
		name,
		status: 'draft',
		startDate: '2027-03-02',
		endDate: '2027-06-01',
		venue: { name: 'Frescati IP' },
		slot: { weekday: 2, time: '19:00', durationMinutes: 60, timezone: 'Europe/Stockholm' },
	}) as Season;

describe('SignupQuestions', () => {
	it('asks about every draft, and skips the one whose own page is open', () => {
		drafts.splice(0, drafts.length, draft('a', 'Spring'), draft('b', 'Summer'));
		render(<SignupQuestions skip='b' />);

		expect(screen.getByText('Spring')).toBeInTheDocument();
		expect(screen.queryByText('Summer')).not.toBeInTheDocument();
	});
});
