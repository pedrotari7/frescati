const mockSetDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockOnSnapshot = vi.fn();

vi.mock('firebase/firestore', () => ({
	setDoc: (...args: unknown[]) => mockSetDoc(...args),
	getDoc: (...args: unknown[]) => mockGetDoc(...args),
	deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
	onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}));

vi.mock('./paths', () => ({
	signupDoc: (seasonId: string, uid: string) => ({ seasonId, uid }),
	signupsCol: () => ({}),
}));

const mockCallFunction = vi.fn();
vi.mock('./call', () => ({ callFunction: (...args: unknown[]) => mockCallFunction(...args) }));

import { clearSignup, confirmSeason, setSignup, subscribeToSignups } from './signups';

const absent = () => mockGetDoc.mockResolvedValue({ data: () => undefined });

beforeEach(() => {
	vi.clearAllMocks();
	absent();
});

describe('setSignup', () => {
	it('writes the whole document with no merge', async () => {
		await setSignup('s1', 'ana', 'yes');

		expect(mockSetDoc).toHaveBeenCalledTimes(1);
		expect(mockSetDoc.mock.calls[0]).toHaveLength(2);
	});

	it('sends answeredBy when somebody answers for the player', async () => {
		await setSignup('s1', 'ana', 'yes', 'admin');

		expect(mockSetDoc.mock.calls[0][1]).toMatchObject({ status: 'yes', answeredBy: 'admin' });
	});

	it('leaves answeredBy out when the player answers for themselves', async () => {
		await setSignup('s1', 'ana', 'no');

		expect(mockSetDoc.mock.calls[0][1]).not.toHaveProperty('answeredBy');
	});

	it('keeps the first answeredAt when the answer changes', async () => {
		mockGetDoc.mockResolvedValue({
			data: () => ({
				status: 'yes',
				answeredAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			}),
		});

		await setSignup('s1', 'ana', 'no');

		const written = mockSetDoc.mock.calls[0][1];

		expect(written.answeredAt).toBe('2026-01-01T00:00:00.000Z');
		expect(written.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
	});

	it('drops an earlier admin answeredBy when the player answers themselves', async () => {
		mockGetDoc.mockResolvedValue({
			data: () => ({ status: 'yes', answeredAt: 'then', updatedAt: 'then', answeredBy: 'admin' }),
		});

		await setSignup('s1', 'ana', 'no');

		expect(mockSetDoc.mock.calls[0][1]).not.toHaveProperty('answeredBy');
	});
});

describe('clearSignup', () => {
	it('deletes the document', async () => {
		await clearSignup('s1', 'ana');

		expect(mockDeleteDoc).toHaveBeenCalledWith({ seasonId: 's1', uid: 'ana' });
	});
});

describe('confirmSeason', () => {
	it('calls the function with the season id and returns what it says', async () => {
		mockCallFunction.mockResolvedValue({ members: 12, share: 260, demoted: [] });

		await expect(confirmSeason('s1')).resolves.toEqual({ members: 12, share: 260, demoted: [] });
		expect(mockCallFunction).toHaveBeenCalledWith('confirmSeason', { seasonId: 's1' });
	});
});

describe('subscribeToSignups', () => {
	it('takes the uid from the document id, since the document does not store it', () => {
		const onData = vi.fn();
		mockOnSnapshot.mockImplementation((_col, next) =>
			next({ docs: [{ id: 'ana', data: () => ({ status: 'yes', answeredAt: 'a', updatedAt: 'b' }) }] })
		);

		subscribeToSignups('s1', onData, vi.fn());

		expect(onData).toHaveBeenCalledWith([{ uid: 'ana', status: 'yes', answeredAt: 'a', updatedAt: 'b' }]);
	});
});
