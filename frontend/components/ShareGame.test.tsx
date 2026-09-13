import { act, render, screen } from '@testing-library/react';
import type { Game, Season } from '@shared/types';
import { EMPTY_COUNTS } from '@shared/types';
import ShareGame from './ShareGame';

const mockNotify = vi.fn();
const mockWarn = vi.fn();

vi.mock('./Toast', () => ({
	useToast: () => ({ notify: mockNotify, warn: mockWarn }),
}));

const season = {
	id: 'season-1',
	minPlayers: 10,
	slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'Europe/Stockholm' },
} as Season;

const game = (overrides: Partial<Game> = {}): Game =>
	({
		id: 'game-1',
		kickoff: '2026-09-01T17:00:00.000Z',
		endsAt: '2026-09-01T18:30:00.000Z',
		status: 'scheduled',
		venue: { name: 'Frescati IP' },
		counts: { ...EMPTY_COUNTS, membersIn: 8, playing: 8 },
		...overrides,
	}) as Game;

const tap = async () => {
	await act(async () => {
		screen.getByRole('button', { name: 'Share this game' }).click();
	});
};

describe('ShareGame', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
	});

	afterEach(() => {
		// `share` is not on jsdom's navigator, so each test that wants one puts
		// it there. Left behind it would make the clipboard tests below unable
		// to reach the branch they exist for.
		Reflect.deleteProperty(navigator, 'share');
	});

	it('hands the game to the share sheet', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { share });

		render(<ShareGame game={game()} season={season} />);
		await tap();

		expect(share).toHaveBeenCalledWith(
			expect.objectContaining({
				text: 'Tue 1 Sep, 19:00 at Frescati IP. 8 playing, 2 short. Can you make it?',
				url: expect.stringContaining('/s/season-1/g/game-1'),
			})
		);
	});

	// The sheet is its own confirmation, and a toast lands behind it, after it
	// has closed, saying the same thing a second time.
	it('says nothing of its own once the sheet has taken it', async () => {
		Object.assign(navigator, { share: vi.fn().mockResolvedValue(undefined) });

		render(<ShareGame game={game()} season={season} />);
		await tap();

		expect(mockNotify).not.toHaveBeenCalled();
		expect(mockWarn).not.toHaveBeenCalled();
	});

	it('copies the message where there is no share sheet', async () => {
		render(<ShareGame game={game()} season={season} />);
		await tap();

		expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
			expect.stringContaining('Tue 1 Sep, 19:00 at Frescati IP. 8 playing, 2 short. Can you make it?')
		);
		expect(mockNotify).toHaveBeenCalledWith('Copied, paste it in the chat');
	});

	// A copy has nothing on screen to show for itself, unlike the sheet.
	it('puts the link on its own line in the copy', async () => {
		render(<ShareGame game={game()} season={season} />);
		await tap();

		const [copied] = vi.mocked(navigator.clipboard.writeText).mock.calls[0];
		expect(copied).toMatch(/\nhttps?:\/\/\S+\/s\/season-1\/g\/game-1$/);
	});

	// Tapping Cancel on the system sheet rejects the same promise a real
	// failure does. Treating it as one put "Couldn't share" in front of
	// somebody who had just said no.
	it('treats a dismissed sheet as nothing happening', async () => {
		Object.assign(navigator, {
			share: vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')),
		});

		render(<ShareGame game={game()} season={season} />);
		await tap();

		expect(mockWarn).not.toHaveBeenCalled();
		expect(mockNotify).not.toHaveBeenCalled();
	});

	it('says so when the share genuinely fails', async () => {
		Object.assign(navigator, { share: vi.fn().mockRejectedValue(new Error('no')) });
		vi.spyOn(console, 'error').mockImplementation(() => {});

		render(<ShareGame game={game()} season={season} />);
		await tap();

		expect(mockWarn).toHaveBeenCalledWith("Couldn't share this game.");
	});

	it('says so when the clipboard refuses', async () => {
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		render(<ShareGame game={game()} season={season} />);
		await tap();

		expect(mockWarn).toHaveBeenCalledWith("Couldn't share this game.");
		expect(mockNotify).not.toHaveBeenCalled();
	});

	it('passes on that a game is off rather than counting it', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { share });

		render(<ShareGame game={game({ status: 'cancelled', cancelledReason: 'Pitch flooded' })} season={season} />);
		await tap();

		expect(share).toHaveBeenCalledWith(
			expect.objectContaining({ text: 'Tue 1 Sep, 19:00 at Frescati IP is off: Pitch flooded' })
		);
	});
});
