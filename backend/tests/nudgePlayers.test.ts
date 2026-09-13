import { nudgePlayers } from '../src/nudgePlayers';
import * as firebase from '../src/lib/firebase';
import * as email from '../src/lib/email';
import { callRequest, clearAuth, clearFirestore, getDb, writeGame, writeSeason, writeResponse } from './helpers';

/**
 * Aiming a reminder at somebody, and mostly the things that stop one going out.
 *
 * The interesting property is that a caller cannot say anything. The request
 * carries uids, every word of the copy is built from the game, and a uid who
 * has already answered is filtered out rather than sent to, so "only people who
 * have not answered" holds without anybody having checked. Most of what is
 * below is that one claim from different directions.
 *
 * FCM has no emulator, so `sendEachForMulticast` is stubbed the way
 * `remindDebtors.test.ts` stubs it. Everything either side of it is real: the
 * season, the game, the responses and the membership.
 */

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const ADMIN = 'admin-1';
const ANNA = 'anna';
const JOHAN = 'johan';

/**
 * A game that many hours from now.
 *
 * `endsAt` has to be set alongside the kickoff rather than left to the fixture,
 * which hardcodes a date in 2026 and would leave every game here reading as
 * already finished however far out its kickoff was.
 */
const inHours = (hours: number) => {
	const kickoff = new Date(Date.now() + hours * 3_600_000);

	return {
		kickoff: kickoff.toISOString(),
		kickoffMillis: kickoff.getTime(),
		endsAt: new Date(kickoff.getTime() + 90 * 60_000).toISOString(),
	};
};

/** Far enough out that the game is open, given the season's 24h deadline. */
const OPEN = inHours(72);

const writeToken = (uid: string) =>
	getDb()
		.doc(`users/${uid}/pushTokens/${uid}-token`)
		.set({ token: `${uid}-token`, createdAt: '2026-08-01' });

/** One FCM result per token sent to. */
const fcmDelivers = (count = 1) =>
	vi.spyOn(firebase, 'messaging').mockReturnValue({
		sendEachForMulticast: vi.fn().mockResolvedValue({
			successCount: count,
			responses: Array.from({ length: count }, () => ({ success: true })),
		}),
	} as never);

const sent = () => vi.mocked(firebase.messaging().sendEachForMulticast);

const call = (data: unknown, auth: { uid: string; admin?: boolean } = { uid: ADMIN }) =>
	nudgePlayers.run(callRequest(data, auth));

const nudge = (uids: string[]) => call({ seasonId: SEASON_ID, gameId: GAME_ID, uids });

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
	vi.spyOn(email, 'sendEmail').mockResolvedValue(0);
	fcmDelivers();
	await writeSeason(SEASON_ID, { adminUids: [ADMIN], memberUids: [ANNA, JOHAN], responseDeadlineHours: 24 });
	await writeGame(SEASON_ID, GAME_ID, OPEN);
});

afterEach(() => vi.restoreAllMocks());

describe('nudgePlayers', () => {
	it('rejects when nobody is signed in', async () => {
		await expect(
			nudgePlayers.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID, uids: [ANNA] }))
		).rejects.toMatchObject({ code: 'unauthenticated' });
	});

	// Being able to buzz the squad is not something somebody gets for being in it.
	it('rejects a member who is not an admin of this season', async () => {
		await expect(
			call({ seasonId: SEASON_ID, gameId: GAME_ID, uids: [JOHAN] }, { uid: ANNA })
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('lets an app admin through whatever the season says', async () => {
		await writeToken(ANNA);

		await expect(
			call({ seasonId: SEASON_ID, gameId: GAME_ID, uids: [ANNA] }, { uid: 'someone', admin: true })
		).resolves.toMatchObject({ asked: 1 });
	});

	it('wants somebody to nudge', async () => {
		await expect(call({ seasonId: SEASON_ID, gameId: GAME_ID, uids: [] })).rejects.toMatchObject({
			code: 'invalid-argument',
		});
	});

	it('sends to a member who has not answered', async () => {
		await writeToken(ANNA);

		await expect(nudge([ANNA])).resolves.toMatchObject({ asked: 1, pushed: 1 });
		expect(sent()).toHaveBeenCalledWith(expect.objectContaining({ tokens: ['anna-token'] }));
	});

	/**
	 * The claim the whole shape rests on. A screen a few seconds stale must not
	 * chase somebody for an answer they have just given, and this is what makes
	 * that true rather than the caller having looked.
	 */
	it('drops somebody who has already answered', async () => {
		await writeToken(ANNA);
		await writeToken(JOHAN);
		await writeResponse(SEASON_ID, GAME_ID, ANNA, { status: 'in' });

		await expect(nudge([ANNA, JOHAN])).resolves.toMatchObject({ asked: 1 });
		expect(sent()).toHaveBeenCalledWith(expect.objectContaining({ tokens: ['johan-token'] }));
	});

	it('says so rather than reporting a cheerful nothing when they have all answered', async () => {
		await writeResponse(SEASON_ID, GAME_ID, ANNA, { status: 'out' });

		await expect(nudge([ANNA])).rejects.toMatchObject({ code: 'failed-precondition' });
		expect(sent()).not.toHaveBeenCalled();
	});

	// They were never asked in the first place, so there is nothing to remind
	// them of. Falls out of `getSilentMembers` rather than being checked here.
	it('will not nudge somebody who is not in the squad', async () => {
		await writeToken('chris');

		await expect(nudge(['chris'])).rejects.toMatchObject({ code: 'failed-precondition' });
		expect(sent()).not.toHaveBeenCalled();
	});

	// "Are you playing?" asks a question the app will not accept an answer to.
	it('refuses a game whose answers have closed', async () => {
		await writeGame(SEASON_ID, GAME_ID, inHours(1));

		await expect(nudge([ANNA])).rejects.toMatchObject({ code: 'failed-precondition' });
		expect(sent()).not.toHaveBeenCalled();
	});

	it('refuses a game that is off', async () => {
		await writeGame(SEASON_ID, GAME_ID, { ...OPEN, status: 'cancelled' });

		await expect(nudge([ANNA])).rejects.toMatchObject({ code: 'failed-precondition' });
		expect(sent()).not.toHaveBeenCalled();
	});

	it('refuses a game that is not there', async () => {
		await expect(call({ seasonId: SEASON_ID, gameId: 'gone', uids: [ANNA] })).rejects.toMatchObject({
			code: 'not-found',
		});
	});

	// One sentence for everybody named, because the copy is about the game and
	// not about the reader, unlike a chase for money.
	it('sends once for the whole group', async () => {
		await writeToken(ANNA);
		await writeToken(JOHAN);
		fcmDelivers(2);

		await expect(nudge([ANNA, JOHAN])).resolves.toMatchObject({ asked: 2, pushed: 2 });
		expect(sent()).toHaveBeenCalledTimes(1);
	});

	/**
	 * The copy comes from the game, and the request has no way to influence it.
	 * This is the guard against the feature becoming a way to send a player
	 * whatever somebody types.
	 */
	it('writes the message from the game rather than from the request', async () => {
		await writeToken(ANNA);

		await nudge([ANNA]);

		const [message] = sent().mock.calls[0];
		expect(message).toMatchObject({
			data: expect.objectContaining({
				title: 'Are you playing?',
				url: `/s/${SEASON_ID}/g/${GAME_ID}`,
			}),
		});
	});
});
