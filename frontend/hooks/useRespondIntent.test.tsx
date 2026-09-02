import { renderHook, waitFor } from '@testing-library/react';
import { useRespondIntent } from './useRespondIntent';

const mockNotify = jest.fn();
const mockWarn = jest.fn();

jest.mock('../components/Toast', () => ({
	useToast: () => ({ notify: mockNotify, warn: mockWarn }),
}));

const setUrl = (search: string) => window.history.pushState(null, '', `/s/season-1/g/game-1${search}`);

describe('useRespondIntent', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		setUrl('');
		jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('does nothing while the season has not loaded yet', () => {
		setUrl('?respond=in');
		const onRespond = jest.fn().mockResolvedValue(undefined);

		renderHook(() => useRespondIntent({ ready: false, isOpen: true, onRespond }));

		expect(onRespond).not.toHaveBeenCalled();
	});

	it('does nothing when there is no respond intent in the URL', () => {
		const onRespond = jest.fn().mockResolvedValue(undefined);

		renderHook(() => useRespondIntent({ ready: true, isOpen: true, onRespond }));

		expect(onRespond).not.toHaveBeenCalled();
	});

	it('ignores a respond value that is not a real response status', () => {
		setUrl('?respond=maybe');
		const onRespond = jest.fn().mockResolvedValue(undefined);

		renderHook(() => useRespondIntent({ ready: true, isOpen: true, onRespond }));

		expect(onRespond).not.toHaveBeenCalled();
	});

	it('answers in on behalf of the notification tap and strips the param', async () => {
		setUrl('?respond=in');
		const onRespond = jest.fn().mockResolvedValue(undefined);

		renderHook(() => useRespondIntent({ ready: true, isOpen: true, onRespond }));

		expect(window.location.search).toBe('');
		await waitFor(() => expect(onRespond).toHaveBeenCalledWith('in'));
		await waitFor(() => expect(mockNotify).toHaveBeenCalledWith("You're in. See you there."));
	});

	// The one thing the app must not tell somebody who is not in the headcount
	// yet, least of all seconds before the screen behind the toast says they
	// are waiting on an admin.
	it('does not promise an extra a game they have not been given a spot in', async () => {
		setUrl('?respond=in');
		const onRespond = jest.fn().mockResolvedValue(undefined);

		renderHook(() => useRespondIntent({ ready: true, isOpen: true, pendingSpot: true, onRespond }));

		await waitFor(() => expect(onRespond).toHaveBeenCalledWith('in'));
		await waitFor(() =>
			expect(mockNotify).toHaveBeenCalledWith("Thanks. An admin has to confirm your spot before you're in.")
		);
	});

	it('answers out on behalf of the notification tap', async () => {
		setUrl('?respond=out');
		const onRespond = jest.fn().mockResolvedValue(undefined);

		renderHook(() => useRespondIntent({ ready: true, isOpen: true, onRespond }));

		await waitFor(() => expect(onRespond).toHaveBeenCalledWith('out'));
		await waitFor(() => expect(mockNotify).toHaveBeenCalledWith("Thanks, you're marked as out."));
	});

	it('warns instead of writing once answers have closed', async () => {
		setUrl('?respond=in');
		const onRespond = jest.fn().mockResolvedValue(undefined);

		renderHook(() => useRespondIntent({ ready: true, isOpen: false, onRespond }));

		await waitFor(() => expect(mockWarn).toHaveBeenCalledWith('Answers for this game have already closed.'));
		expect(onRespond).not.toHaveBeenCalled();
	});

	it('warns when the write itself fails', async () => {
		setUrl('?respond=in');
		const onRespond = jest.fn().mockRejectedValue(new Error('offline'));

		renderHook(() => useRespondIntent({ ready: true, isOpen: true, onRespond }));

		await waitFor(() =>
			expect(mockWarn).toHaveBeenCalledWith("Couldn't save your answer. Open the game and try again.")
		);
	});

	it('only ever handles the intent once', async () => {
		setUrl('?respond=in');
		const onRespond = jest.fn().mockResolvedValue(undefined);

		const { rerender } = renderHook(props => useRespondIntent(props), {
			initialProps: { ready: true, isOpen: true, onRespond },
		});

		await waitFor(() => expect(onRespond).toHaveBeenCalledTimes(1));

		rerender({ ready: true, isOpen: true, onRespond });

		expect(onRespond).toHaveBeenCalledTimes(1);
	});
});
