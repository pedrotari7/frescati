vi.mock('../src/lib/teams', () => ({ enqueueTeamRebuild: vi.fn().mockResolvedValue(undefined) }));

import { onSeasonWrite } from '../src/onSeasonWrite';
import { sendSignupReminders } from '../src/sendSignupReminders';
import * as push from '../src/lib/push';
import {
	aSeason,
	clearAuth,
	clearFirestore,
	getDb,
	readResponse,
	writeGame,
	writeResponse,
	writeSeason,
	writeUser,
	writtenEvent,
} from './helpers';

/**
 * The two ways a season signing up gets announced: once when it opens, and
 * every third day after that to whoever has not answered.
 *
 * FCM has no emulator, so the sender is spied on and what these read is who it
 * was handed. The seasons, users and answers are real documents.
 */

const SEASON_ID = 'season-1';
const ANNA = 'anna';
const JOHAN = 'johan';
const MARIA = 'maria';

const draft = (overrides = {}) => aSeason({ status: 'draft', memberUids: [], ...overrides });

const writeSignup = (uid: string) =>
	getDb()
		.doc(`seasons/${SEASON_ID}/signups/${uid}`)
		.set({ status: 'yes', answeredAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z' });

/** A season created three days ago, so today is the first reminder day. */
const createdDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const civilDate = (daysFromNow: number) =>
	new Date(Date.now() + daysFromNow * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });

let sendSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
	await Promise.all([ANNA, JOHAN, MARIA].map(uid => writeUser(uid)));
	sendSpy = vi.spyOn(push, 'sendSignupPush').mockResolvedValue({ pushed: 0, emailed: 0 });
});

afterEach(() => vi.restoreAllMocks());

describe('announcing a season that is signing up', () => {
	it('asks every user when a draft is created', async () => {
		const season = draft();

		await onSeasonWrite.run(writtenEvent({ seasonId: SEASON_ID }, undefined, season) as never);

		expect(sendSpy).toHaveBeenCalledTimes(1);
		const [uids, kind, context] = sendSpy.mock.calls[0]!;
		expect([...uids].sort()).toEqual([ANNA, JOHAN, MARIA]);
		expect(kind).toBe('signupOpen');
		expect(context).toMatchObject({ seasonId: SEASON_ID, seasonName: 'Autumn 2026' });
	});

	it('writes the close date out in the push', async () => {
		const season = draft({ signupClosesOn: '2026-09-01' });

		await onSeasonWrite.run(writtenEvent({ seasonId: SEASON_ID }, undefined, season) as never);

		expect(sendSpy.mock.calls[0]![2]).toMatchObject({ closesOn: 'Tue 1 Sep' });
	});

	it('sends nothing when a quiet draft is created', async () => {
		await onSeasonWrite.run(writtenEvent({ seasonId: SEASON_ID }, undefined, draft({ quiet: true })) as never);

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('sends once when a draft stops being quiet', async () => {
		await onSeasonWrite.run(
			writtenEvent({ seasonId: SEASON_ID }, draft({ quiet: true }), draft({ quiet: false })) as never
		);

		expect(sendSpy).toHaveBeenCalledTimes(1);
		expect(sendSpy.mock.calls[0]![1]).toBe('signupOpen');
	});

	it('sends nothing when a draft that was never quiet is saved again', async () => {
		await onSeasonWrite.run(
			writtenEvent({ seasonId: SEASON_ID }, draft({ quiet: false }), draft({ quiet: false })) as never
		);

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('sends nothing when a draft is made quiet', async () => {
		await onSeasonWrite.run(writtenEvent({ seasonId: SEASON_ID }, draft(), draft({ quiet: true })) as never);

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('sends nothing for quiet changes on an active season', async () => {
		await onSeasonWrite.run(
			writtenEvent({ seasonId: SEASON_ID }, aSeason({ quiet: true }), aSeason({ quiet: false })) as never
		);

		expect(sendSpy).not.toHaveBeenCalled();
	});
});

describe('a failure while announcing', () => {
	it('does not stop the roster recount in the same write', async () => {
		await writeGame(SEASON_ID, 'game-1', { kickoff: new Date(Date.now() + 86_400_000).toISOString() });
		await writeResponse(SEASON_ID, 'game-1', JOHAN, { status: 'in', role: 'extra' });
		sendSpy.mockRejectedValue(new Error('FCM is down'));

		await onSeasonWrite.run(
			writtenEvent(
				{ seasonId: SEASON_ID },
				draft({ quiet: true, memberUids: [ANNA] }),
				draft({ quiet: false, memberUids: [ANNA, JOHAN] })
			) as never
		);

		expect(sendSpy).toHaveBeenCalledTimes(1);
		expect((await readResponse(SEASON_ID, 'game-1', JOHAN))?.role).toBe('member');
	});
});

describe('sendSignupReminders', () => {
	it('reminds only the users who have not answered, on a due day', async () => {
		await writeSeason(SEASON_ID, { status: 'draft', memberUids: [], createdAt: createdDaysAgo(3) });
		await writeSignup(ANNA);

		await sendSignupReminders.run(undefined as never);

		expect(sendSpy).toHaveBeenCalledTimes(1);
		const [uids, kind] = sendSpy.mock.calls[0]!;
		expect([...uids].sort()).toEqual([JOHAN, MARIA]);
		expect(kind).toBe('signupReminder');
	});

	it('sends nothing on a day that is not due', async () => {
		await writeSeason(SEASON_ID, { status: 'draft', memberUids: [], createdAt: createdDaysAgo(2) });

		await sendSignupReminders.run(undefined as never);

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('sends nothing for a quiet season', async () => {
		await writeSeason(SEASON_ID, { status: 'draft', quiet: true, createdAt: createdDaysAgo(3) });

		await sendSignupReminders.run(undefined as never);

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('sends nothing for an active season', async () => {
		await writeSeason(SEASON_ID, { status: 'active', createdAt: createdDaysAgo(3) });

		await sendSignupReminders.run(undefined as never);

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('sends nothing once the close date has passed', async () => {
		await writeSeason(SEASON_ID, {
			status: 'draft',
			signupClosesOn: civilDate(-1),
			createdAt: createdDaysAgo(3),
		});

		await sendSignupReminders.run(undefined as never);

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('still reminds on the close date itself', async () => {
		await writeSeason(SEASON_ID, {
			status: 'draft',
			signupClosesOn: civilDate(0),
			createdAt: createdDaysAgo(3),
		});

		await sendSignupReminders.run(undefined as never);

		expect(sendSpy).toHaveBeenCalledTimes(1);
	});

	it('still reminds the next season when the first one fails', async () => {
		await writeSeason('season-a', { status: 'draft', createdAt: createdDaysAgo(3) });
		await writeSeason('season-b', { status: 'draft', createdAt: createdDaysAgo(3) });
		sendSpy.mockRejectedValueOnce(new Error('FCM is down'));

		await sendSignupReminders.run(undefined as never);

		expect(sendSpy).toHaveBeenCalledTimes(2);
	});

	it('still reminds the other seasons when a draft is malformed', async () => {
		await writeSeason(SEASON_ID, { status: 'draft', createdAt: createdDaysAgo(3) });
		await getDb()
			.doc('seasons/broken')
			.set({ status: 'draft', name: 'Broken', createdAt: createdDaysAgo(3) });

		await sendSignupReminders.run(undefined as never);

		expect(sendSpy).toHaveBeenCalledTimes(1);
		expect(sendSpy.mock.calls[0]![2]).toMatchObject({ seasonId: SEASON_ID });
	});

	it('sends nothing when everybody has answered', async () => {
		await writeSeason(SEASON_ID, { status: 'draft', createdAt: createdDaysAgo(3) });
		await Promise.all([ANNA, JOHAN, MARIA].map(writeSignup));

		await sendSignupReminders.run(undefined as never);

		expect(sendSpy).not.toHaveBeenCalled();
	});
});
