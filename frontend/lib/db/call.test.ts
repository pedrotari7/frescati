const mockCallable = jest.fn();
const mockHttpsCallable = jest.fn(() => mockCallable);

jest.mock('firebase/functions', () => ({
	httpsCallable: (...args: unknown[]) => mockHttpsCallable(...(args as [])),
}));

jest.mock('../firebaseClient', () => ({ getFunctionsClient: () => ({ region: 'europe-west1' }) }));

import { callFunction } from './call';

beforeEach(() => {
	jest.clearAllMocks();
	mockCallable.mockResolvedValue({ data: { ok: true } });
});

describe('callFunction', () => {
	it('builds the callable against the shared client, by name', async () => {
		await callFunction('setAppAdmin', { uid: 'anna', isAdmin: true });

		expect(mockHttpsCallable).toHaveBeenCalledWith({ region: 'europe-west1' }, 'setAppAdmin');
	});

	it('passes the request body through', async () => {
		await callFunction('setAppAdmin', { uid: 'anna', isAdmin: true });

		expect(mockCallable).toHaveBeenCalledWith({ uid: 'anna', isAdmin: true });
	});

	// The envelope is what every caller was unwrapping by hand.
	it('unwraps the result rather than the envelope around it', async () => {
		mockCallable.mockResolvedValue({ data: { url: 'https://example.test/feed' } });

		await expect(callFunction<void, { url: string }>('getCalendarLink', undefined)).resolves.toEqual({
			url: 'https://example.test/feed',
		});
	});

	/**
	 * Deliberately not caught. A callable rejects with an HttpsError carrying the
	 * message the function chose, and `useWrite` is what turns that into a toast
	 * — swallowing it here would take the wording away from the function that
	 * wrote it.
	 */
	it('lets the rejection through with its message intact', async () => {
		mockCallable.mockRejectedValue(new Error('App admins only.'));

		await expect(callFunction('setAppAdmin', { uid: 'anna' })).rejects.toThrow('App admins only.');
	});
});
