import { FieldValue } from 'firebase-admin/firestore';
import { sendReminders } from '../src/sendReminders';
import * as push from '../src/lib/push';
import { clearAuth, clearFirestore, getDb, readGame, writeGame, writeResponse, writeSeason } from './helpers';

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

	it('ignores a game that has already kicked off', async () => {
		await writeSeason(SEASON_ID, { status: 'active', memberUids: [SILENT_MEMBER], reminderHours: [72, 24] });
		await writeGame(SEASON_ID, GAME_ID, { status: 'scheduled', kickoff: hoursFromNow(-2) });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await sendReminders.run(undefined as never);

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('ignores a cancelled game somebody has not answered', async () => {
		// Nobody is playing, so there is nothing to be nudged about.
		await writeSeason(SEASON_ID, { status: 'active', memberUids: [SILENT_MEMBER], reminderHours: [72, 24] });
		await writeGame(SEASON_ID, GAME_ID, { status: 'cancelled', kickoff: hoursFromNow(48) });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await sendReminders.run(undefined as never);

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('never nudges an extra who has not answered', async () => {
		// A reminder goes to the squad. An extra is anybody signed in, so
		// nudging the silent ones would mail the entire user base about a game
		// they have nothing to do with.
		await writeSeason(SEASON_ID, { status: 'active', memberUids: [MEMBER], reminderHours: [72, 24] });
		await writeGame(SEASON_ID, GAME_ID, { status: 'scheduled', kickoff: hoursFromNow(48) });
		await writeResponse(SEASON_ID, GAME_ID, MEMBER, { status: 'in', role: 'member' });
		await writeResponse(SEASON_ID, GAME_ID, 'extra-1', { status: 'in', role: 'extra' });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await sendReminders.run(undefined as never);

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('records the window even when the whole squad has already answered', async () => {
		// Nothing to send, but the window still has to be marked — otherwise this
		// game is re-examined every hour for three days.
		await writeSeason(SEASON_ID, { status: 'active', memberUids: [MEMBER], reminderHours: [72, 24] });
		await writeGame(SEASON_ID, GAME_ID, { status: 'scheduled', kickoff: hoursFromNow(48) });
		await writeResponse(SEASON_ID, GAME_ID, MEMBER, { status: 'in', role: 'member' });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await sendReminders.run(undefined as never);

		expect(sendSpy).not.toHaveBeenCalled();
		expect((await readGame(SEASON_ID, GAME_ID))?.remindersSent).toEqual([72]);
	});

	it('leaves a season saved before reminderHours existed alone', async () => {
		// This used to throw and take the whole sweep down with it.
		await writeSeason(SEASON_ID, { status: 'active', memberUids: [SILENT_MEMBER] });
		await getDb().doc(`seasons/${SEASON_ID}`).update({ reminderHours: FieldValue.delete() });
		await writeGame(SEASON_ID, GAME_ID, { status: 'scheduled', kickoff: hoursFromNow(48) });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await expect(sendReminders.run(undefined as never)).resolves.toBeUndefined();

		expect(sendSpy).not.toHaveBeenCalled();
	});
});

/**
 * The two `catch` blocks, which are the reason this sweep is written the way it
 * is. Nothing retries a schedule — the schedule *is* the retry, and the next run
 * is an hour of silence away — so one bad document must never cost everybody
 * else their nudge. Both go through `reportError`, because a swallowed failure
 * that repeats weekly is exactly what GCP cannot see.
 */
describe('sendReminders when one document is broken', () => {
	const OTHER_SEASON = 'season-2';

	beforeEach(async () => {
		await writeSeason(OTHER_SEASON, { status: 'active', memberUids: [SILENT_MEMBER], reminderHours: [72, 24] });
		await writeGame(OTHER_SEASON, GAME_ID, { status: 'scheduled', kickoff: hoursFromNow(48) });
	});

	it('still sweeps every other season when one is malformed', async () => {
		// `reminderHours` as a number rather than a list: not iterable, so
		// spreading it throws before the sweep reaches any of its games.
		await writeSeason(SEASON_ID, {
			status: 'active',
			memberUids: [SILENT_MEMBER],
			reminderHours: 72 as unknown as number[],
		});
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await expect(sendReminders.run(undefined as never)).resolves.toBeUndefined();

		expect(sendSpy).toHaveBeenCalledWith([SILENT_MEMBER], 'reminder', expect.objectContaining({ gameId: GAME_ID }));
	});

	it('still nudges the rest of a season when one game cannot be sent', async () => {
		await writeSeason(SEASON_ID, { status: 'active', memberUids: [SILENT_MEMBER], reminderHours: [72, 24] });
		await writeGame(SEASON_ID, 'game-broken', { status: 'scheduled', kickoff: hoursFromNow(48) });

		const sendSpy = jest
			.spyOn(push, 'sendGamePush')
			.mockImplementation(async (_uids, _kind, payload: { gameId?: string }) => {
				if (payload.gameId === 'game-broken') throw new Error('FCM refused');

				return { pushed: 1, emailed: 0 };
			});

		await expect(sendReminders.run(undefined as never)).resolves.toBeUndefined();

		expect(sendSpy).toHaveBeenCalledWith([SILENT_MEMBER], 'reminder', expect.objectContaining({ gameId: GAME_ID }));
	});

	it('leaves the window unrecorded on the game that failed, so the next run retries it', async () => {
		await writeSeason(SEASON_ID, { status: 'active', memberUids: [SILENT_MEMBER], reminderHours: [72, 24] });
		jest.spyOn(push, 'sendGamePush').mockRejectedValue(new Error('FCM refused'));

		await sendReminders.run(undefined as never);

		expect((await readGame(OTHER_SEASON, GAME_ID))?.remindersSent).toBeUndefined();
	});
});
