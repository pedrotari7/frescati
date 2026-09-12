import { raiseGameDues } from '../src/lib/dues';
import * as push from '../src/lib/push';
import type { Due, Season } from '../../shared/types';
import { aSeason, clearFirestore, getDb, writeGame, writeResponse, writeSeason, writeUser } from './helpers';

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';

/** The charge an extra picks up for playing, at the id the sweep would use. */
const readDue = async (uid: string, gameId = GAME_ID): Promise<Due | undefined> => {
	const snapshot = await getDb().doc(`seasons/${SEASON_ID}/dues/game_${gameId}_${uid}`).get();

	return snapshot.exists ? (snapshot.data() as Due) : undefined;
};

const readBook = async (): Promise<string[]> => {
	const snapshot = await getDb().collection(`seasons/${SEASON_ID}/dues`).get();

	return snapshot.docs.map(doc => doc.id).sort();
};

/**
 * Somebody who turned out as a guest and was given a spot.
 *
 * `confirmOverride` is what a spot *is* for an extra. Without it they said they
 * were coming and an admin never nodded, which is the case below that owes
 * nothing.
 */
const anExtraWhoPlayed = (uid: string, gameId = GAME_ID) =>
	writeResponse(SEASON_ID, gameId, uid, { role: 'extra', status: 'in', confirmOverride: true });

const season = (fees?: Season['fees'], overrides: Partial<Season> = {}): Promise<Season> =>
	writeSeason(SEASON_ID, { ...overrides, ...(fees ? { fees } : {}) });

/**
 * The send is spied on rather than driven through FCM.
 *
 * What `raiseGameDues` decides is who gets told and what the copy says about
 * them, and `push.test.ts` already owns everything below that. Left unmocked it
 * would reach for `messaging()` against an emulator that has no Cloud Messaging
 * to reach.
 *
 * Cleared on the way out, because `vi.spyOn` hands back the mock it already
 * installed rather than a fresh one, so a test that raises a charge and then
 * asks what the *next* raise sent would otherwise count the first one too.
 * `mockClear` empties the call log and leaves the resolved value alone.
 */
const silenceSends = () => vi.spyOn(push, 'sendDueRaised').mockResolvedValue({ pushed: 1, emailed: 0 }).mockClear();

beforeEach(async () => {
	await clearFirestore();
	silenceSends();
});

afterEach(() => vi.restoreAllMocks());

describe('raiseGameDues', () => {
	it('charges every extra who played, at the fee the season is set to', async () => {
		const theSeason = await season({ total: 0, perGame: 80 });
		await anExtraWhoPlayed('sam');
		await anExtraWhoPlayed('kim');

		expect(await raiseGameDues(SEASON_ID, GAME_ID, theSeason)).toBe(2);

		expect(await readDue('sam')).toMatchObject({ uid: 'sam', kind: 'game', amount: 80, gameId: GAME_ID });
		// Owing and unsigned, which is the only shape a charge nobody has settled
		// is allowed to have: see `settlementIsCoherent` in the rules.
		expect(await readDue('kim')).toMatchObject({ status: 'owing' });
		expect(await readDue('kim')).not.toHaveProperty('settledBy');
	});

	it('charges nobody who did not play as an extra', async () => {
		const theSeason = await season({ total: 0, perGame: 70 });
		const extra = { role: 'extra', status: 'in', confirmOverride: true } as const;

		await writeResponse(SEASON_ID, GAME_ID, 'regular', { role: 'member', status: 'in' });
		// In, but no admin ever gave them a spot, so they never had one to pay for.
		await writeResponse(SEASON_ID, GAME_ID, 'pending', { role: 'extra', status: 'in' });
		await writeResponse(SEASON_ID, GAME_ID, 'absent', { ...extra, absent: true });
		await writeResponse(SEASON_ID, GAME_ID, 'stayed-home', { ...extra, status: 'out' });

		expect(await raiseGameDues(SEASON_ID, GAME_ID, theSeason)).toBe(0);
		expect(await readBook()).toEqual([]);
	});

	it('raises nothing for a season with no per-game fee', async () => {
		const theSeason = await season({ total: 9600, perGame: 0 });
		await anExtraWhoPlayed('sam');

		expect(await raiseGameDues(SEASON_ID, GAME_ID, theSeason)).toBe(0);
		expect(await readBook()).toEqual([]);
	});

	/**
	 * The derived id is what makes this safe, and the reason it has to be proved
	 * here rather than left to the rules: the Admin SDK is not subject to them, so
	 * `onlySettles()` is not standing behind this write the way it stands behind
	 * the finances screen's sweep.
	 */
	it('raises nothing the second time, having raised everything the first', async () => {
		const theSeason = await season({ total: 0, perGame: 70 });
		await anExtraWhoPlayed('sam');

		expect(await raiseGameDues(SEASON_ID, GAME_ID, theSeason)).toBe(1);
		expect(await raiseGameDues(SEASON_ID, GAME_ID, theSeason)).toBe(0);
		expect(await readBook()).toEqual([`game_${GAME_ID}_sam`]);
	});

	it('leaves a charge somebody has already paid exactly as it was', async () => {
		const theSeason = await season({ total: 0, perGame: 70 });
		await anExtraWhoPlayed('sam');

		const paid: Omit<Due, 'id'> = {
			uid: 'sam',
			kind: 'game',
			amount: 70,
			gameId: GAME_ID,
			status: 'paid',
			settledAt: '2026-09-02T09:00:00.000Z',
			settledBy: 'season-admin-1',
			createdAt: '2026-09-01T20:00:00.000Z',
		};

		await getDb().doc(`seasons/${SEASON_ID}/dues/game_${GAME_ID}_sam`).set(paid);

		expect(await raiseGameDues(SEASON_ID, GAME_ID, theSeason)).toBe(0);
		expect(await readDue('sam')).toEqual(paid);
	});

	it('charges an extra for each game separately', async () => {
		const theSeason = await season({ total: 0, perGame: 70 });
		await anExtraWhoPlayed('sam');
		await anExtraWhoPlayed('sam', 'game-2');

		await raiseGameDues(SEASON_ID, GAME_ID, theSeason);
		await raiseGameDues(SEASON_ID, 'game-2', theSeason);

		expect(await readBook()).toEqual([`game_${GAME_ID}_sam`, 'game_game-2_sam']);
	});

	it('tells each extra what they have just been charged', async () => {
		const sent = silenceSends();
		const theSeason = await season({ total: 0, perGame: 80 });
		await writeGame(SEASON_ID, GAME_ID, { kickoff: '2026-09-01T17:00:00.000Z' });
		await anExtraWhoPlayed('sam');
		await anExtraWhoPlayed('kim');

		await raiseGameDues(SEASON_ID, GAME_ID, theSeason);

		// One send each, because the copy names the reader's own amount and
		// whether their own next In is held.
		expect(sent).toHaveBeenCalledTimes(2);
		expect(sent.mock.calls.map(call => call[0]).sort()).toEqual(['kim', 'sam']);
		expect(sent.mock.calls[0][1]).toMatchObject({
			seasonId: SEASON_ID,
			gameId: GAME_ID,
			amount: 80,
			// The date the books put on the same charge, in the season's
			// timezone, which is an hour ahead of that UTC kickoff.
			when: 'Tue 1 Sep',
			blocked: true,
		});
	});

	/**
	 * The audience is the charges, not the lineup.
	 *
	 * Everybody here turned out and every one of them is on the team sheet. Only
	 * one of them owes anything for it, and a bill in front of the other three
	 * would be the app inventing a debt: a member has already paid their share of
	 * the season, an extra nobody gave a spot to never had one, and somebody
	 * marked absent never played.
	 */
	it('tells only the extra who owes for this game, not everybody who played', async () => {
		const sent = silenceSends();
		const theSeason = await season({ total: 4000, perGame: 70 }, { memberUids: ['regular'] });
		await writeGame(SEASON_ID, GAME_ID);
		await anExtraWhoPlayed('sam');
		await writeResponse(SEASON_ID, GAME_ID, 'regular', { role: 'member', status: 'in' });
		await writeResponse(SEASON_ID, GAME_ID, 'pending', { role: 'extra', status: 'in' });
		await writeResponse(SEASON_ID, GAME_ID, 'noshow', {
			role: 'extra',
			status: 'in',
			confirmOverride: true,
			absent: true,
		});

		await raiseGameDues(SEASON_ID, GAME_ID, theSeason);

		expect(sent).toHaveBeenCalledTimes(1);
		expect(sent.mock.calls[0][0]).toBe('sam');
		// The season carries a bill as well, and confirming a game is not the
		// moment to split it. Entry charges stay with the admin's sweep, which is
		// the only thing that knows the squad is finished being added to.
		expect(await readBook()).toEqual([`game_${GAME_ID}_sam`]);
	});

	/**
	 * A charge already on the books has already been acted on.
	 *
	 * An admin who swept the season last week raised it, and may well have chased
	 * it since. Announcing it now would be the app telling somebody about a debt
	 * they were chased for on Thursday, and the same confirmation still has a
	 * genuinely new charge to announce to the person beside them.
	 */
	it('leaves alone whoever was already charged for this game', async () => {
		const theSeason = await season({ total: 0, perGame: 70 });
		await writeGame(SEASON_ID, GAME_ID);
		await anExtraWhoPlayed('swept');
		await raiseGameDues(SEASON_ID, GAME_ID, theSeason);

		const sent = silenceSends();
		await anExtraWhoPlayed('latecomer');

		expect(await raiseGameDues(SEASON_ID, GAME_ID, theSeason)).toBe(1);
		expect(sent).toHaveBeenCalledTimes(1);
		expect(sent.mock.calls[0][0]).toBe('latecomer');
	});

	// The charge names one game and so does the bill for it. An extra who guested
	// twice owes twice, and each notification has to be about the one it is for,
	// or the second reads as a duplicate of the first and gets ignored.
	it('names the game the charge is for and no other', async () => {
		const theSeason = await season({ total: 0, perGame: 70 });
		await writeGame(SEASON_ID, GAME_ID, { kickoff: '2026-09-01T17:00:00.000Z' });
		await writeGame(SEASON_ID, 'game-2', { kickoff: '2026-09-08T17:00:00.000Z' });
		await anExtraWhoPlayed('sam');
		await anExtraWhoPlayed('sam', 'game-2');
		await raiseGameDues(SEASON_ID, GAME_ID, theSeason);

		const sent = silenceSends();
		await raiseGameDues(SEASON_ID, 'game-2', theSeason);

		expect(sent).toHaveBeenCalledTimes(1);
		expect(sent.mock.calls[0][1]).toMatchObject({ gameId: 'game-2', when: 'Tue 8 Sep' });
	});

	// An admin owes their share like everybody else and is never locked out by
	// it, so the sentence about not signing up would be a lie sent by their own
	// app. The same split `remindDebtors` makes, off the same function.
	it('does not tell a season admin their next In is held', async () => {
		const sent = silenceSends();
		const theSeason = await season({ total: 0, perGame: 70 }, { adminUids: ['boss'] });
		await writeGame(SEASON_ID, GAME_ID);
		await anExtraWhoPlayed('boss');

		await raiseGameDues(SEASON_ID, GAME_ID, theSeason);

		expect(sent.mock.calls[0][1]).toMatchObject({ blocked: false });
	});

	it('does not tell an app admin either', async () => {
		const sent = silenceSends();
		const theSeason = await season({ total: 0, perGame: 70 });
		await writeGame(SEASON_ID, GAME_ID);
		await writeUser('boss', { isAppAdmin: true });
		await anExtraWhoPlayed('boss');

		await raiseGameDues(SEASON_ID, GAME_ID, theSeason);

		expect(sent.mock.calls[0][1]).toMatchObject({ blocked: false });
	});

	// A second confirmation raises nothing, so there is nothing to announce. A
	// bill for a game somebody paid for in September is worse than no bill.
	it('tells nobody when every charge was already raised', async () => {
		const theSeason = await season({ total: 0, perGame: 70 });
		await writeGame(SEASON_ID, GAME_ID);
		await anExtraWhoPlayed('sam');
		await raiseGameDues(SEASON_ID, GAME_ID, theSeason);

		const sent = silenceSends();
		await raiseGameDues(SEASON_ID, GAME_ID, theSeason);

		expect(sent).not.toHaveBeenCalled();
	});

	/**
	 * The charges are written before the send, and they stay written.
	 *
	 * A failed notification costs somebody finding out when they next open the
	 * app, which is where they were before any of this existed. Leaving the books
	 * wrong, or costing the man-of-the-match vote that sends straight after this,
	 * would both be worse.
	 */
	it('keeps the charges when the notification fails', async () => {
		vi.spyOn(push, 'sendDueRaised').mockRejectedValue(new Error('fcm is having a day'));
		const theSeason = await season({ total: 0, perGame: 70 });
		await writeGame(SEASON_ID, GAME_ID);
		await anExtraWhoPlayed('sam');

		expect(await raiseGameDues(SEASON_ID, GAME_ID, theSeason)).toBe(1);
		expect(await readDue('sam')).toMatchObject({ amount: 70, status: 'owing' });
	});

	// `remindedAt` is drawn in the books as "chased two days ago" beside a name,
	// which has to stay a claim about somebody having followed the money up. The
	// bill arriving is not that.
	it('leaves the books reading as never chased', async () => {
		const theSeason = await season({ total: 0, perGame: 70 });
		await writeGame(SEASON_ID, GAME_ID);
		await anExtraWhoPlayed('sam');

		await raiseGameDues(SEASON_ID, GAME_ID, theSeason);

		const marker = await getDb().doc(`seasons/${SEASON_ID}/debtors/sam`).get();

		expect(marker.data()?.remindedAt).toBeUndefined();
	});

	// A season created before fees existed reads as the defaults rather than as
	// broken, which is `feesFor`'s whole job. The charge it raises is the same one
	// the sweep would have raised for it.
	it('falls back to the default fee on a season that never set one', async () => {
		await anExtraWhoPlayed('sam');

		expect(await raiseGameDues(SEASON_ID, GAME_ID, aSeason({ id: SEASON_ID }))).toBe(1);
		expect(await readDue('sam')).toMatchObject({ amount: 70 });
	});
});
