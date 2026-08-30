import { remindDebtors } from '../src/remindDebtors';
import type { Debtor } from '../../shared/types';
import * as firebase from '../src/lib/firebase';
import * as email from '../src/lib/email';
import { callRequest, clearAuth, clearFirestore, getDb, writeSeason, writeUser } from './helpers';

/**
 * Chasing a payment, and mostly the things that stop one going out.
 *
 * The interesting property is that a caller cannot say what somebody owes. The
 * request carries uids, the figures come off the marks `onDueWrite` writes, and
 * a uid with no mark is filtered out rather than sent to, so "only people who
 * owe money" holds without anybody having checked. Most of what is below is that
 * one claim from different directions.
 *
 * FCM has no emulator, so `sendEachForMulticast` is stubbed the way `push.test.ts`
 * stubs it. Everything either side of it is real: the marks, the profiles, the
 * season and the stamp written back.
 */

const SEASON_ID = 'season-1';
const ADMIN = 'admin-1';
const ANNA = 'anna';
const JOHAN = 'johan';

const mark = (uid: string, overrides: Partial<Debtor> = {}): Promise<unknown> =>
	getDb()
		.doc(`seasons/${SEASON_ID}/debtors/${uid}`)
		.set({ uid, outstanding: 500, charges: 1, updatedAt: '2026-08-30T09:00:00.000Z', ...overrides });

const readMark = async (uid: string): Promise<Debtor | undefined> => {
	const snapshot = await getDb().doc(`seasons/${SEASON_ID}/debtors/${uid}`).get();

	return snapshot.exists ? (snapshot.data() as Debtor) : undefined;
};

/** A registered device, so a send has something to succeed against. */
const writeToken = (uid: string) =>
	getDb()
		.doc(`users/${uid}/pushTokens/${uid}-token`)
		.set({ token: `${uid}-token`, createdAt: '2026-08-01' });

/** One FCM result per token, and `sendDuesReminder` sends one person at a time. */
const fcmDelivers = (success = true) =>
	jest.spyOn(firebase, 'messaging').mockReturnValue({
		sendEachForMulticast: jest.fn().mockResolvedValue({
			successCount: success ? 1 : 0,
			responses: [success ? { success: true } : { success: false, error: { code: 'messaging/internal-error' } }],
		}),
	} as never);

const call = (data: unknown, auth: { uid: string; admin?: boolean } = { uid: ADMIN }) =>
	remindDebtors.run(callRequest(data, auth));

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
	// Nobody has an address unless a test gives them one, so the fallback reports
	// nothing sent and a push is the only way anything gets through.
	jest.spyOn(email, 'sendEmail').mockResolvedValue(0);
	fcmDelivers();
	await writeSeason(SEASON_ID, { adminUids: [ADMIN] });
});

afterEach(() => jest.restoreAllMocks());

describe('remindDebtors', () => {
	it('rejects when nobody is signed in', async () => {
		await expect(remindDebtors.run(callRequest({ seasonId: SEASON_ID }))).rejects.toMatchObject({
			code: 'unauthenticated',
		});
	});

	// The books belong to the season, and being able to buzz everybody in it is
	// not something a member gets for being in the squad.
	it('rejects a member who does not run the season', async () => {
		await expect(call({ seasonId: SEASON_ID }, { uid: ANNA })).rejects.toMatchObject({
			code: 'permission-denied',
		});
	});

	it('lets an app admin through whatever the season says', async () => {
		await mark(ANNA);

		const { reminded } = await call({ seasonId: SEASON_ID }, { uid: 'someone-else', admin: true });

		expect(reminded.map(outcome => outcome.uid)).toEqual([ANNA]);
	});

	it('rejects a call with no season on it', async () => {
		await expect(call({})).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	it('reports a season that has been deleted rather than chasing nobody', async () => {
		await getDb().doc(`seasons/${SEASON_ID}`).delete();

		await expect(call({ seasonId: SEASON_ID }, { uid: ADMIN, admin: true })).rejects.toMatchObject({
			code: 'not-found',
		});
	});

	it('chases everybody who owes when no list is given', async () => {
		await mark(ANNA);
		await mark(JOHAN);

		const { reminded } = await call({ seasonId: SEASON_ID });

		expect(reminded.map(outcome => outcome.uid).sort()).toEqual([ANNA, JOHAN]);
	});

	it('chases only the person asked for', async () => {
		await mark(ANNA);
		await mark(JOHAN);

		const { reminded } = await call({ seasonId: SEASON_ID, uids: [ANNA] });

		expect(reminded.map(outcome => outcome.uid)).toEqual([ANNA]);
	});

	// The whole safety argument in one test. There is no amount in the request to
	// begin with, and the only thing that decides whether somebody is sent to is
	// whether the trigger has written a mark for them.
	it('sends nothing to somebody the books say is settled up', async () => {
		await mark(ANNA);

		const { reminded } = await call({ seasonId: SEASON_ID, uids: [ANNA, JOHAN] });

		expect(reminded.map(outcome => outcome.uid)).toEqual([ANNA]);
	});

	// A screen a few seconds stale, chasing somebody who has just paid. Told
	// rather than answered with a cheerful empty result, because it means the
	// books and the list the admin is looking at disagree.
	it('says so when nobody named owes anything', async () => {
		await expect(call({ seasonId: SEASON_ID, uids: [JOHAN] })).rejects.toMatchObject({
			code: 'failed-precondition',
		});
	});

	// Not an error. An admin pressing "remind everybody" on a season nobody owes
	// anything to has asked for nothing to happen, and nothing happened.
	it('chases nobody quietly when nobody owes', async () => {
		expect(await call({ seasonId: SEASON_ID })).toEqual({ reminded: [] });
	});

	it('reports the figure off the mark, not one the caller supplied', async () => {
		await mark(ANNA, { outstanding: 1735, charges: 2 });
		await writeToken(ANNA);

		const { reminded } = await call({ seasonId: SEASON_ID, uids: [ANNA], outstanding: 99999 });

		expect(reminded[0]).toMatchObject({ uid: ANNA, outstanding: 1735, pushed: 1 });
	});

	it('records the chase against the mark once it lands', async () => {
		await mark(ANNA);
		await writeToken(ANNA);

		await call({ seasonId: SEASON_ID, uids: [ANNA] });

		expect((await readMark(ANNA))?.remindedAt).toEqual(expect.any(String));
	});

	// "Chased two days ago" beside a name has to mean they heard about it. A send
	// that reached no device and no address would otherwise tell the next admin
	// the job was done.
	it('records nothing when the chase reached nobody', async () => {
		await mark(ANNA);
		await writeToken(ANNA);
		fcmDelivers(false);

		const { reminded } = await call({ seasonId: SEASON_ID, uids: [ANNA] });

		expect(reminded[0]).toMatchObject({ pushed: 0, emailed: 0 });
		expect((await readMark(ANNA))?.remindedAt).toBeUndefined();
	});

	// The mark can go between the read and the write, because marking a payment
	// is the other thing an admin does while chasing. Putting it back with a
	// merge would lock a paid-up player out with nothing on the books to say why.
	it('does not resurrect a mark that was cleared mid-chase', async () => {
		await mark(ANNA);
		await writeToken(ANNA);
		jest.spyOn(email, 'sendEmail').mockImplementation(async uids => {
			await getDb().doc(`seasons/${SEASON_ID}/debtors/${ANNA}`).delete();

			return uids.length;
		});
		fcmDelivers(false);

		await call({ seasonId: SEASON_ID, uids: [ANNA] });

		expect(await readMark(ANNA)).toBeUndefined();
	});

	// Same split `debtStanding` makes on the client. A season admin owes their
	// share and is never locked out by it, so the sentence about not signing up
	// would be a lie told to the person running the season.
	it('tells a blocked player the debt is holding their In', async () => {
		await mark(ANNA);
		await writeToken(ANNA);
		const sendEmail = jest.spyOn(email, 'sendEmail').mockResolvedValue(0);
		fcmDelivers(false);

		await call({ seasonId: SEASON_ID, uids: [ANNA] });

		expect(sendEmail.mock.calls[0][1].body).toContain('cannot say you are in');
	});

	it('leaves that out for an admin the books cannot lock', async () => {
		await mark(ADMIN);
		const sendEmail = jest.spyOn(email, 'sendEmail').mockResolvedValue(0);

		await call({ seasonId: SEASON_ID, uids: [ADMIN] });

		expect(sendEmail.mock.calls[0][1].body).not.toContain('cannot say you are in');
	});

	it('leaves it out for an app admin too, who is not in adminUids', async () => {
		await mark(JOHAN);
		await writeUser(JOHAN, { isAppAdmin: true });
		const sendEmail = jest.spyOn(email, 'sendEmail').mockResolvedValue(0);

		await call({ seasonId: SEASON_ID, uids: [JOHAN] });

		expect(sendEmail.mock.calls[0][1].body).not.toContain('cannot say you are in');
	});

	// One payload each, because the amount in it is the reader's own. Getting
	// this wrong would mail everybody the first debtor's balance.
	it('names each person their own amount', async () => {
		await mark(ANNA, { outstanding: 500 });
		await mark(JOHAN, { outstanding: 60 });
		const sendEmail = jest.spyOn(email, 'sendEmail').mockResolvedValue(0);

		await call({ seasonId: SEASON_ID });

		const titles = new Map(sendEmail.mock.calls.map(([uids, payload]) => [uids[0], payload.title]));

		expect(titles.get(ANNA)).toBe('You owe 500 kr');
		expect(titles.get(JOHAN)).toBe('You owe 60 kr');
	});
});
