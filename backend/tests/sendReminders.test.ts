import { sendReminders } from '../src/sendReminders';
import * as push from '../src/lib/push';
import { clearAuth, clearFirestore, readGame, writeGame, writeResponse, writeSeason } from './helpers';

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const MEMBER = 'member-1';
const SILENT_MEMBER = 'member-2';

const hoursFromNow = (hours: number): string => new Date(Date.now() + hours * 3_600_000).toISOString();

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

// `jest.spyOn` reuses the same mock across calls on an already-spied method, so
// without this its call count would keep accumulating across tests in this file.
afterEach(() => jest.restoreAllMocks());

describe('sendReminders', () => {
	it('nudges members who have not answered once their window opens', async () => {
		await writeSeason(SEASON_ID, {
			status: 'active',
			memberUids: [MEMBER, SILENT_MEMBER],
			reminderHours: [72, 24],
		});
		await writeGame(SEASON_ID, GAME_ID, { status: 'scheduled', kickoff: hoursFromNow(48) });
		await writeResponse(SEASON_ID, GAME_ID, MEMBER, { status: 'in', role: 'member' });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await sendReminders.run(undefined as never);

		expect(sendSpy).toHaveBeenCalledWith([SILENT_MEMBER], 'reminder', expect.objectContaining({ gameId: GAME_ID }));

		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.remindersSent).toEqual([72]);
	});

	it('does not resend a reminder once its window is recorded', async () => {
		await writeSeason(SEASON_ID, { status: 'active', memberUids: [SILENT_MEMBER], reminderHours: [72, 24] });
		await writeGame(SEASON_ID, GAME_ID, { status: 'scheduled', kickoff: hoursFromNow(48), remindersSent: [72] });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await sendReminders.run(undefined as never);

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('collapses every missed window into a single reminder', async () => {
		await writeSeason(SEASON_ID, { status: 'active', memberUids: [SILENT_MEMBER], reminderHours: [72, 24] });
		// Both the 72h and 24h windows have already passed by the time this runs.
		await writeGame(SEASON_ID, GAME_ID, { status: 'scheduled', kickoff: hoursFromNow(20) });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await sendReminders.run(undefined as never);

		expect(sendSpy).toHaveBeenCalledTimes(1);
		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.remindersSent).toEqual(expect.arrayContaining([72, 24]));
	});

	it('ignores seasons that are not active', async () => {
		await writeSeason(SEASON_ID, { status: 'draft', memberUids: [SILENT_MEMBER], reminderHours: [72] });
		await writeGame(SEASON_ID, GAME_ID, { status: 'scheduled', kickoff: hoursFromNow(48) });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await sendReminders.run(undefined as never);

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('ignores games further out than every reminder window', async () => {
		await writeSeason(SEASON_ID, { status: 'active', memberUids: [SILENT_MEMBER], reminderHours: [72, 24] });
		await writeGame(SEASON_ID, GAME_ID, { status: 'scheduled', kickoff: hoursFromNow(200) });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await sendReminders.run(undefined as never);

		expect(sendSpy).not.toHaveBeenCalled();
	});
});
