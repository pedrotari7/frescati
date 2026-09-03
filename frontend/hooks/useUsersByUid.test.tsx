import { renderHook } from '@testing-library/react';
import type { AppUser } from '@shared/types';

const anna = { uid: 'anna', displayName: 'Anna' } as AppUser;
const marco = { uid: 'marco', displayName: 'Marco' } as AppUser;

let mockUsers: AppUser[] = [anna, marco];
let mockLoading = false;

vi.mock('../lib/db/users', () => ({ subscribeToUsers: vi.fn(), subscribeToUser: vi.fn() }));
vi.mock('./useFirestoreSubscription', () => ({
	useFirestoreSubscription: () => ({ data: mockUsers, loading: mockLoading, error: null }),
}));

import { useUsersByUid } from './useData';

beforeEach(() => {
	mockUsers = [anna, marco];
	mockLoading = false;
});

describe('useUsersByUid', () => {
	it('keys the profiles by uid', () => {
		const { result } = renderHook(() => useUsersByUid());

		expect(result.current.usersByUid.get('marco')).toBe(marco);
	});

	it('still hands back the list, for callers that need both', () => {
		const { result } = renderHook(() => useUsersByUid());

		expect(result.current.users).toEqual([anna, marco]);
	});

	/**
	 * The reason this is a shared hook rather than a `useMemo` in each of the
	 * seven screens: six components take the map as a prop, and a fresh Map on
	 * every render defeats every memo below it.
	 */
	it('keeps the same map across renders while the profiles are unchanged', () => {
		const { result, rerender } = renderHook(() => useUsersByUid());
		const first = result.current.usersByUid;

		rerender();

		expect(result.current.usersByUid).toBe(first);
	});

	it('rebuilds the map when somebody joins', () => {
		const { result, rerender } = renderHook(() => useUsersByUid());
		const first = result.current.usersByUid;

		mockUsers = [anna, marco, { uid: 'pedro', displayName: 'Pedro' } as AppUser];
		rerender();

		expect(result.current.usersByUid).not.toBe(first);
		expect(result.current.usersByUid.size).toBe(3);
	});

	// Three callers gate a skeleton on it, so it has to come through.
	it('passes the loading flag through', () => {
		mockLoading = true;

		const { result } = renderHook(() => useUsersByUid());

		expect(result.current.loading).toBe(true);
	});
});
