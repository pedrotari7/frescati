import { act, render, screen, waitFor } from '@testing-library/react';
import CalendarSubscribeSheet from './CalendarSubscribeSheet';

const mockNotify = vi.fn();
const mockWarn = vi.fn();

vi.mock('./Toast', () => ({
	useToast: () => ({ notify: mockNotify, warn: mockWarn }),
}));

const mockGetCalendarLink = vi.fn();

vi.mock('../lib/db/calendar', () => ({
	getCalendarLink: (...args: unknown[]) => mockGetCalendarLink(...args),
	rotateCalendarToken: vi.fn(),
}));

const URL_ = 'https://frescati.example/calendarFeed?token=abc';

describe('CalendarSubscribeSheet', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetCalendarLink.mockResolvedValue(URL_);
		Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
	});

	it('copies the link and toasts success when the clipboard write succeeds', async () => {
		vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

		render(<CalendarSubscribeSheet seasonId='season-1' open onClose={vi.fn()} />);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument());

		await act(async () => {
			screen.getByRole('button', { name: 'Copy link' }).click();
		});

		expect(navigator.clipboard.writeText).toHaveBeenCalledWith(URL_);
		expect(mockNotify).toHaveBeenCalledWith('Link copied');
		expect(mockWarn).not.toHaveBeenCalled();
	});

	// Copy is this dialog's primary action. A silently-swallowed rejection
	// (permission denied, an insecure context, an older WebView) must not leave
	// the button looking like nothing happened.
	it('toasts an error instead of doing nothing when the clipboard write is rejected', async () => {
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		render(<CalendarSubscribeSheet seasonId='season-1' open onClose={vi.fn()} />);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument());

		await act(async () => {
			screen.getByRole('button', { name: 'Copy link' }).click();
		});

		expect(mockWarn).toHaveBeenCalledWith("Couldn't copy the link.");
		expect(mockNotify).not.toHaveBeenCalled();
	});
});
