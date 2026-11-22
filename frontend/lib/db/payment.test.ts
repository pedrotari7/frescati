const mockSetDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockCall = vi.fn();

vi.mock('firebase/firestore', () => ({
	setDoc: (...args: unknown[]) => mockSetDoc(...args),
	deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
}));

vi.mock('./paths', () => ({ paymentDoc: (uid: string) => `users/${uid}/private/payment` }));
vi.mock('./subscribe', () => ({ subscribeToDoc: vi.fn() }));
vi.mock('./call', () => ({ callFunction: (...args: unknown[]) => mockCall(...args) }));

import { clearPayment, listPayees, savePayment } from './payment';

beforeEach(() => vi.clearAllMocks());

describe('savePayment', () => {
	it('writes the trimmed number with a timestamp, and nothing else', async () => {
		await savePayment('anna', ' 0701234567 ');

		const [path, data] = mockSetDoc.mock.calls[0];

		expect(path).toBe('users/anna/private/payment');
		expect(Object.keys(data).sort()).toEqual(['swish', 'updatedAt']);
		expect(data.swish).toBe('0701234567');
	});

	it('refuses an empty number rather than writing it', async () => {
		await expect(savePayment('anna', '   ')).rejects.toThrow();

		expect(mockSetDoc).not.toHaveBeenCalled();
	});
});

describe('clearPayment', () => {
	it('deletes the document', async () => {
		await clearPayment('anna');

		expect(mockDeleteDoc).toHaveBeenCalledWith('users/anna/private/payment');
	});
});

describe('listPayees', () => {
	it('unwraps the list from the callable', async () => {
		const payees = [{ uid: 'anna', displayName: 'Anna', hasNumber: true }];
		mockCall.mockResolvedValue({ payees });

		await expect(listPayees()).resolves.toEqual(payees);
		expect(mockCall).toHaveBeenCalledWith('listPayees', undefined);
	});
});
