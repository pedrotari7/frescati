import { FieldValue } from 'firebase-admin/firestore';
import { closeMotmVoting } from '../src/closeMotmVoting';
import { finaliseTournament } from '../src/finaliseTournament';
import { onMotmVoteWrite } from '../src/onMotmVoteWrite';
import { MOTM_BONUS_ELO } from '../../shared/rating';
import * as push from '../src/lib/push';
import {
	callRequest,
	clearAuth,
	clearFirestore,
	clearMotmVote,
	getDb,
	paramsEvent,
	readGame,
	readMotm,
	readMotmVoters,
	readRatingLedger,
	readUser,
	writeGame,
	writeMatch,
	writeMotmVote,
	writeSeason,
	writeTeams,
	writeUser,
} from './helpers';

/**
 * The vote, end to end: confirming a game opens it, the sweep counts it, and
 * the bonus reaches the ladder through a replay rather than a poke.
 *
 * FCM has no emulator, so the notification is spied on rather than sent — what
 * matters here is who it went to and that it went once.
 */

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const ADMIN = 'season-admin-1';
/** Somebody carrying the app-admin badge who is not in this season at all. */
const APP_ADMIN = 'app-admin-1';

const TEAM_A = ['p1', 'p2', 'p3', 'p4'];
const TEAM_B = ['p5', 'p6', 'p7', 'p8'];
const EVERYONE = [...TEAM_A, ...TEAM_B];

/** A played game with a lineup and one scoreline, ready to be confirmed. */
const setUpGame = async () => {
	await writeSeason(SEASON_ID, { memberUids: EVERYONE, adminUids: [ADMIN] });
	await writeGame(SEASON_ID, GAME_ID);
	await writeTeams(SEASON_ID, GAME_ID, [TEAM_A, TEAM_B]);
	await writeMatch(SEASON_ID, GAME_ID, { order: 0, teamA: 0, teamB: 1, scoreA: 2, scoreB: 1 });
};

const confirm = () => finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN }));

/** Wind the deadline back so the sweep considers the vote due. */
const expireTheVote = async () => {
	await writeGame(SEASON_ID, GAME_ID, {
		...(await readGame(SEASON_ID, GAME_ID))!,
		motmVotingUntilMillis: Date.now() - 1_000,
	});
};

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

afterEach(() => jest.restoreAllMocks());

describe('opening the vote', () => {
	it('opens it when a game is confirmed, and asks everybody who played', async () => {
		await setUpGame();
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await confirm();

		const game = await readGame(SEASON_ID, GAME_ID);

		expect(game?.motmVotingUntilMillis).toBeGreaterThan(Date.now());
		expect(sendSpy).toHaveBeenCalledTimes(1);
		expect(sendSpy.mock.calls[0][0].sort()).toEqual([...EVERYONE].sort());
		expect(sendSpy.mock.calls[0][1]).toBe('motm');
	});

	// They own the correction if it goes wrong, and knowing the window is running
	// is what makes chasing a turnout possible before it shuts rather than after.
	// Told, not asked: the rules only let the lineup actually vote.
	it('tells an app admin who did not play that it is open', async () => {
		await setUpGame();
		await writeUser(APP_ADMIN, { isAppAdmin: true });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await confirm();

		expect(sendSpy.mock.calls[0][0].sort()).toEqual([...EVERYONE, APP_ADMIN].sort());
	});

	// `sendPush` resolves one recipient per uid, so twice would be two lookups
	// and — for anybody it falls back to email for — two identical mails.
	it('names an app admin who played once rather than twice', async () => {
		await setUpGame();
		await writeUser('p1', { isAppAdmin: true });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await confirm();

		expect(sendSpy.mock.calls[0][0].sort()).toEqual([...EVERYONE].sort());
	});

	// The game page is a headcount for a game that has already been played.
	it('points people at the team sheet, where the vote is', async () => {
		await setUpGame();
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await confirm();

		expect(sendSpy.mock.calls[0][2].url).toBe(`/s/${SEASON_ID}/g/${GAME_ID}/tournament`);
	});

	// Below `MIN_TOURNAMENT_PLAYERS` there is no lineup, nothing to rate and
	// nobody a vote could be about.
	it('stays shut on a game that never had a lineup', async () => {
		await writeSeason(SEASON_ID, { memberUids: EVERYONE, adminUids: [ADMIN] });
		await writeGame(SEASON_ID, GAME_ID);
		await writeMatch(SEASON_ID, GAME_ID, { order: 0, teamA: 0, teamB: 1, scoreA: 2, scoreB: 1 });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await expect(confirm()).rejects.toMatchObject({ code: 'failed-precondition' });

		expect((await readGame(SEASON_ID, GAME_ID))?.motmVotingUntilMillis).toBeUndefined();
		expect(sendSpy).not.toHaveBeenCalled();
	});

	// Clearing every score un-rates a game and puts it back in the confirmation
	// sweep's queue. Without the guard, re-confirming would reopen a vote the
	// group has already had and rate the game against a different answer.
	it('refuses to reopen a vote that has already been counted', async () => {
		await setUpGame();
		await confirm();
		await writeMotmVote(SEASON_ID, GAME_ID, 'p1', 'p5');
		await expireTheVote();
		await closeMotmVoting.run({} as never);

		// Back to unrated, exactly the way a replay leaves a game whose scores
		// have all been cleared — then confirmed again.
		await getDb()
			.doc(`seasons/${SEASON_ID}/games/${GAME_ID}`)
			.update({ resultFinalisedAt: FieldValue.delete(), status: 'scheduled' });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await confirm();

		expect((await readGame(SEASON_ID, GAME_ID))?.motmVotingUntilMillis).toBeUndefined();
		expect(sendSpy).not.toHaveBeenCalled();
	});
});

/**
 * The one thing about a vote in progress that is published. Every test here is
 * really the same test twice over: that it says who, and that it never says
 * what.
 */
describe('the turnout while the vote is open', () => {
	const recount = (uid: string) => onMotmVoteWrite.run(paramsEvent({ seasonId: SEASON_ID, gameId: GAME_ID, uid }));

	it('publishes who has voted and nothing about their picks', async () => {
		await setUpGame();
		await confirm();
		await writeMotmVote(SEASON_ID, GAME_ID, 'p1', 'p5');
		await writeMotmVote(SEASON_ID, GAME_ID, 'p3', 'p5');

		await recount('p3');

		const voters = await readMotmVoters(SEASON_ID, GAME_ID);

		expect(voters?.uids).toEqual(['p1', 'p3']);
		// The whole bargain in one assertion: two people voted for p5 and no
		// document anybody can read says so until the sweep counts them.
		expect(JSON.stringify(voters)).not.toContain('p5');
	});

	// The same third state the vote itself uses. An empty list would be a claim
	// that the vote has been looked at; no document is "nobody yet".
	it('writes nothing at all before the first vote', async () => {
		await setUpGame();
		await confirm();

		await recount('p1');

		expect(await readMotmVoters(SEASON_ID, GAME_ID)).toBeUndefined();
	});

	it('takes somebody off it when they withdraw', async () => {
		await setUpGame();
		await confirm();
		await writeMotmVote(SEASON_ID, GAME_ID, 'p1', 'p5');
		await writeMotmVote(SEASON_ID, GAME_ID, 'p2', 'p6');
		await recount('p2');

		await clearMotmVote(SEASON_ID, GAME_ID, 'p1');
		await recount('p1');

		expect((await readMotmVoters(SEASON_ID, GAME_ID))?.uids).toEqual(['p2']);
	});

	// Recomputed rather than added to: a retried trigger must not count anybody
	// twice, and there is no delta here that could.
	it('arrives at the same list however many times it runs', async () => {
		await setUpGame();
		await confirm();
		await writeMotmVote(SEASON_ID, GAME_ID, 'p1', 'p5');

		await recount('p1');
		await recount('p1');

		expect((await readMotmVoters(SEASON_ID, GAME_ID))?.uids).toEqual(['p1']);
	});

	it('goes when the votes are counted, because the totals carry it from then on', async () => {
		await setUpGame();
		await confirm();
		await writeMotmVote(SEASON_ID, GAME_ID, 'p1', 'p5');
		await recount('p1');
		await expireTheVote();

		await closeMotmVoting.run({} as never);

		expect(await readMotmVoters(SEASON_ID, GAME_ID)).toBeUndefined();
	});

	// A vote cast in the last moment of the window, whose trigger lands after the
	// sweep has been past. The decision is what says the counting has happened,
	// so a late recount tidies up rather than republishing the voters for good.
	it('is not resurrected by a trigger that runs after the count', async () => {
		await setUpGame();
		await confirm();
		await writeMotmVote(SEASON_ID, GAME_ID, 'p1', 'p5');
		await expireTheVote();
		await closeMotmVoting.run({} as never);

		await recount('p1');

		expect(await readMotmVoters(SEASON_ID, GAME_ID)).toBeUndefined();
	});
});

describe('closing the vote', () => {
	it('leaves a vote that still has time to run alone', async () => {
		await setUpGame();
		await confirm();
		await writeMotmVote(SEASON_ID, GAME_ID, 'p1', 'p5');

		await closeMotmVoting.run({} as never);

		expect(await readMotm(SEASON_ID, GAME_ID)).toBeUndefined();
		expect((await readGame(SEASON_ID, GAME_ID))?.motmVotingUntilMillis).toBeGreaterThan(0);
	});

	it('counts the votes and shuts the door behind it', async () => {
		await setUpGame();
		await confirm();
		await writeMotmVote(SEASON_ID, GAME_ID, 'p1', 'p5');
		await writeMotmVote(SEASON_ID, GAME_ID, 'p2', 'p5');
		await writeMotmVote(SEASON_ID, GAME_ID, 'p3', 'p1');
		await expireTheVote();

		await closeMotmVoting.run({} as never);

		expect((await readMotm(SEASON_ID, GAME_ID))?.winners).toEqual(['p5']);
		expect((await readMotm(SEASON_ID, GAME_ID))?.counts).toEqual([
			{ uid: 'p5', votes: 2 },
			{ uid: 'p1', votes: 1 },
		]);
		// Gone, which is what takes the game out of this sweep's query for good.
		expect((await readGame(SEASON_ID, GAME_ID))?.motmVotingUntilMillis).toBeUndefined();
	});

	// A decision, not an absence of one: "nobody voted" and "not counted yet"
	// would otherwise be the same document.
	it('records a vote nobody cast rather than leaving it open forever', async () => {
		await setUpGame();
		await confirm();
		await expireTheVote();

		await closeMotmVoting.run({} as never);

		expect(await readMotm(SEASON_ID, GAME_ID)).toMatchObject({ winners: [], counts: [] });
		expect((await readGame(SEASON_ID, GAME_ID))?.motmVotingUntilMillis).toBeUndefined();
	});

	it('pays the winner out of everybody who played', async () => {
		await setUpGame();
		for (const uid of EVERYONE) await writeUser(uid);
		await confirm();

		const before = (await readUser('p5'))!.rating!.elo;
		const others = await Promise.all(TEAM_A.map(async uid => (await readUser(uid))!.rating!.elo));

		await writeMotmVote(SEASON_ID, GAME_ID, 'p1', 'p5');
		await expireTheVote();
		await closeMotmVoting.run({} as never);

		const after = (await readUser('p5'))!.rating!.elo;

		expect(after - before).toBeCloseTo(MOTM_BONUS_ELO - MOTM_BONUS_ELO / EVERYONE.length, 6);

		// Everybody else pays their share, so the ladder's average is untouched.
		for (const [index, uid] of TEAM_A.entries()) {
			expect((await readUser(uid))!.rating!.elo - others[index]).toBeCloseTo(
				-MOTM_BONUS_ELO / EVERYONE.length,
				6
			);
		}
	});

	// The ledger is what a career screen reads, and what a rewind restores from,
	// so the vote has to be in it rather than only in the profiles it moved.
	it('records the winner on the ledger entry', async () => {
		await setUpGame();
		await confirm();

		expect((await readRatingLedger(GAME_ID))?.motm).toBeUndefined();

		await writeMotmVote(SEASON_ID, GAME_ID, 'p1', 'p5');
		await expireTheVote();
		await closeMotmVoting.run({} as never);

		expect((await readRatingLedger(GAME_ID))?.motm).toEqual(['p5']);
	});

	it('splits the pot when the vote ties', async () => {
		await setUpGame();
		for (const uid of EVERYONE) await writeUser(uid);
		await confirm();

		const before = (await readUser('p5'))!.rating!.elo;

		await writeMotmVote(SEASON_ID, GAME_ID, 'p1', 'p5');
		await writeMotmVote(SEASON_ID, GAME_ID, 'p2', 'p6');
		await expireTheVote();
		await closeMotmVoting.run({} as never);

		expect((await readMotm(SEASON_ID, GAME_ID))?.winners).toEqual(['p5', 'p6']);
		expect((await readUser('p5'))!.rating!.elo - before).toBeCloseTo(
			MOTM_BONUS_ELO / 2 - MOTM_BONUS_ELO / EVERYONE.length,
			6
		);
	});

	// Nothing to apply, so replaying every game since this one would be a rewind
	// of the whole ladder to arrive back where it started.
	it('does not replay the ladder for a game nobody voted in', async () => {
		await setUpGame();
		await confirm();
		await expireTheVote();

		const finalise = await import('../src/lib/finalise');
		const replaySpy = jest.spyOn(finalise, 'requestRatingReplay');

		await closeMotmVoting.run({} as never);

		expect(replaySpy).not.toHaveBeenCalled();
	});

	// The window stays put on a failure, so the next hour tries the same game
	// again rather than leaving its vote open for good.
	it('leaves one wedged game without stranding the rest', async () => {
		await setUpGame();
		await confirm();
		await writeMotmVote(SEASON_ID, GAME_ID, 'p1', 'p5');
		await expireTheVote();

		const motm = await import('../src/lib/motm');
		jest.spyOn(motm, 'closeMotmVote').mockRejectedValueOnce(new Error('nope'));

		await expect(closeMotmVoting.run({} as never)).resolves.toBeUndefined();

		expect((await readGame(SEASON_ID, GAME_ID))?.motmVotingUntilMillis).toBeLessThan(Date.now());
	});
});

/**
 * The other half of the exchange. Everybody here was interrupted two days ago to
 * be asked a question, and until this went in the answer only ever reached the
 * ones who happened to open the app again.
 */
describe('announcing the result', () => {
	/** A confirmed game with votes in, wound past its deadline and ready to count. */
	const voteAndExpire = async (votes: [string, string][]) => {
		await setUpGame();
		await confirm();
		for (const [voter, pick] of votes) await writeMotmVote(SEASON_ID, GAME_ID, voter, pick);
		await expireTheVote();
	};

	// The lineup rather than the voters: somebody who never got round to voting
	// still played, and scoping it to people who answered would quietly turn the
	// result into a reward for having answered.
	it('tells everybody who played, whether or not they voted', async () => {
		await voteAndExpire([['p1', 'p5']]);
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await closeMotmVoting.run({} as never);

		expect(sendSpy).toHaveBeenCalledTimes(1);
		expect(sendSpy.mock.calls[0][0].sort()).toEqual([...EVERYONE].sort());
		expect(sendSpy.mock.calls[0][1]).toBe('motmResult');
	});

	// The same standing that has them hearing the vote open: they are the only
	// people who can do anything about a wrong answer, since the bonus reaches a
	// rating through a replay.
	it('tells an app admin who did not play', async () => {
		await writeUser(APP_ADMIN, { isAppAdmin: true });
		await voteAndExpire([['p1', 'p5']]);
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await closeMotmVoting.run({} as never);

		expect(sendSpy.mock.calls[0][0].sort()).toEqual([...EVERYONE, APP_ADMIN].sort());
	});

	// By display name rather than uid: this is the one payload whose subject is
	// not the person reading it.
	it('carries the winner’s name and how close it was', async () => {
		await writeUser('p5', { displayName: 'Anders' });
		await voteAndExpire([
			['p1', 'p5'],
			['p2', 'p5'],
			['p3', 'p1'],
		]);
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await closeMotmVoting.run({} as never);

		expect(sendSpy.mock.calls[0][2]).toMatchObject({ winners: ['Anders'], votes: 2 });
	});

	// Everybody level on the most votes is level by construction, so one number
	// covers a tie however many people share it.
	it('names everybody who tied', async () => {
		await writeUser('p5', { displayName: 'Anders' });
		await writeUser('p6', { displayName: 'Björn' });
		await voteAndExpire([
			['p1', 'p5'],
			['p2', 'p6'],
		]);
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await closeMotmVoting.run({} as never);

		expect(sendSpy.mock.calls[0][2]).toMatchObject({ winners: ['Anders', 'Björn'], votes: 1 });
	});

	// The same place the question landed, so tapping the answer goes where
	// tapping the ask did — and where the totals now are.
	it('points at the team sheet, where the totals are', async () => {
		await voteAndExpire([['p1', 'p5']]);
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await closeMotmVoting.run({} as never);

		expect(sendSpy.mock.calls[0][2].url).toBe(`/s/${SEASON_ID}/g/${GAME_ID}/tournament`);
	});

	// There is a decision document either way — that is what says the counting
	// happened — but "nobody voted" is not news anybody needs a phone to buzz for.
	it('says nothing when nobody voted', async () => {
		await voteAndExpire([]);
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		await closeMotmVoting.run({} as never);

		expect(await readMotm(SEASON_ID, GAME_ID)).toMatchObject({ winners: [] });
		expect(sendSpy).not.toHaveBeenCalled();
	});

	// The decision is written and the window is gone by the time this sends, so a
	// throw would cost the winner their bonus over a notification that failed —
	// and the sweep would log a misleading "could not count" for a vote it
	// counted correctly.
	it('still pays the winner when the notification fails', async () => {
		for (const uid of EVERYONE) await writeUser(uid);
		await voteAndExpire([['p1', 'p5']]);

		const before = (await readUser('p5'))!.rating!.elo;
		jest.spyOn(push, 'sendGamePush').mockRejectedValueOnce(new Error('fcm is having a day'));

		await expect(closeMotmVoting.run({} as never)).resolves.toBeUndefined();

		expect((await readUser('p5'))!.rating!.elo - before).toBeCloseTo(
			MOTM_BONUS_ELO - MOTM_BONUS_ELO / EVERYONE.length,
			6
		);
		expect((await readRatingLedger(GAME_ID))?.motm).toEqual(['p5']);
	});
});
