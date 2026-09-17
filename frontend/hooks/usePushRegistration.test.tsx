import { renderHook, waitFor } from '@testing-library/react';

const mockCheckPushSupport = vi.fn();
const mockIsPushEnabled = vi.fn();

vi.mock('../lib/push', () => ({
	checkPushSupport: () => mockCheckPushSupport(),
	isPushEnabled: (uid: string) => mockIsPushEnabled(uid),
}));

import { usePushRegistration } from './usePushRegistration';

beforeEach(() => {
	vi.clearAllMocks();
	mockCheckPushSupport.mockResolvedValue('supported');
	mockIsPushEnabled.mockResolvedValue(true);
});

describe('usePushRegistration', () => {
	// Both start `null` so a screen can hold its shape rather than claim
	// "unsupported" for the frame before the check comes back.
	it('answers neither question until the checks land', () => {
		const { result } = renderHook(() => usePushRegistration('anna'));

		expect(result.current.support).toBeNull();
		expect(result.current.enabled).toBeNull();
	});

	it('reports what the browser supports and whether this device is registered', async () => {
		const { result } = renderHook(() => usePushRegistration('anna'));

		await waitFor(() => expect(result.current.support).toBe('supported'));
		await waitFor(() => expect(result.current.enabled).toBe(true));

		expect(mockIsPushEnabled).toHaveBeenCalledWith('anna');
	});

	// The two answers fail differently: an iPhone on Safari can be told to
	// install the app, where a device that has not been asked gets a button.
	it('keeps the support answer when this device is not registered', async () => {
		mockCheckPushSupport.mockResolvedValue('needs-install');
		mockIsPushEnabled.mockResolvedValue(false);

		const { result } = renderHook(() => usePushRegistration('anna'));

		await waitFor(() => expect(result.current.support).toBe('needs-install'));
		await waitFor(() => expect(result.current.enabled).toBe(false));
	});

	// Signed out there is nobody to ask about, but the browser check still runs:
	// what it supports has nothing to do with who is looking.
	it('asks nothing about registration with no uid', async () => {
		const { result } = renderHook(() => usePushRegistration(undefined));

		await waitFor(() => expect(result.current.support).toBe('supported'));

		expect(mockIsPushEnabled).not.toHaveBeenCalled();
		expect(result.current.enabled).toBeNull();
	});

	it('asks again when a different account signs in', async () => {
		const { result, rerender } = renderHook(({ uid }) => usePushRegistration(uid), {
			initialProps: { uid: 'anna' as string | undefined },
		});

		await waitFor(() => expect(result.current.enabled).toBe(true));

		mockIsPushEnabled.mockResolvedValue(false);
		rerender({ uid: 'marco' });

		await waitFor(() => expect(result.current.enabled).toBe(false));
		expect(mockIsPushEnabled).toHaveBeenLastCalledWith('marco');
	});

	// The guard that is easy to leave out of a second copy: a slow answer for
	// the account that has just been signed out must not overwrite the new one.
	it('drops an answer that lands after the account changed', async () => {
		let settleAnna: (on: boolean) => void = () => {};
		mockIsPushEnabled.mockImplementation((uid: string) =>
			uid === 'anna' ? new Promise<boolean>(resolve => (settleAnna = resolve)) : Promise.resolve(false)
		);

		const { result, rerender } = renderHook(({ uid }) => usePushRegistration(uid), {
			initialProps: { uid: 'anna' as string | undefined },
		});

		rerender({ uid: 'marco' });
		await waitFor(() => expect(result.current.enabled).toBe(false));

		settleAnna(true);

		await waitFor(() => expect(result.current.enabled).toBe(false));
	});
});
