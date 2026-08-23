jest.mock('../src/lib/teams', () => ({ enqueueTeamRebuild: jest.fn().mockResolvedValue(undefined) }));

import { onResponseWrite } from '../src/onResponseWrite';
import { enqueueTeamRebuild } from '../src/lib/teams';
import * as push from '../src/lib/push';
import {
	aResponse,
	clearAuth,
	clearFirestore,
	getDb,
	paramsEvent,
	readGame,
	writeGame,
	writeResponse,
	writeSeason,
	writeUser,
	writtenEvent,
} from './helpers';

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const MEMBER = 'member-1';
const OTHER_MEMBER = 'member-2';
const WATCHER = 'watcher-1';

const enqueue = enqueueTeamRebuild as jest.Mock;

/**
 * Whoever is following this game. Written straight in rather than through the
 * client, because the rules only ever let somebody follow on their own behalf
 * and these tests need a watcher who isn't the one answering.
 */
const writeWatcher = (uid: string, gameId = GAME_ID) =>
	getDb()
		.doc(`seasons/${SEASON_ID}/games/${gameId}/watchers/${uid}`)
		.set({ uid, createdAt: '2026-08-30T09:00:00.000Z' });

/**
 * Stands in for the whole send. `sendGamePush` is the seam rather than
 * `sendPush` so these assert on the kind and the copy's inputs, which is what
 * decides whether the right people are told the right thing. Whether FCM then
 * accepts a token is `push.test.ts`.
 */
const captureSends = () => {
	const spy = jest.spyOn(push, 'sendGamePush').mockResolvedValue({ pushed: 0, emailed: 0 });

	return spy;
};

/** A response write as the trigger sees it, with both halves of the document. */
const responseEvent = (before: unknown, after: unknown, uid = MEMBER) =>
	writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID, uid }, before, after);

const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;

const gameAt = (kickoffMillis: number) => ({
	kickoff: new Date(kickoffMillis).toISOString(),
	endsAt: new Date(kickoffMillis + 1.5 * HOUR).toISOString(),
});

/**
 * Relative to now rather than the fixed dates `aGame` carries, because
 * `isWatchable` reads the clock: pinned to 2026-09-01, every test below would
 * quietly stop testing a game that is still ahead of you the day that date
 * passes, and the whole suite would go on passing while asserting nothing.
 */
const upcoming = () => gameAt(Date.now() + WEEK);
const alreadyPlayed = () => gameAt(Date.now() - WEEK);

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
	enqueue.mockClear();
});

afterEach(() => jest.restoreAllMocks());

describe('onResponseWrite', () => {
	it('recounts the game a response belongs to', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER, OTHER_MEMBER], minPlayers: 2 });
		await writeGame(SEASON_ID, GAME_ID);
		await writeResponse(SEASON_ID, GAME_ID, MEMBER, { status: 'in', role: 'member' });

		await onResponseWrite.run(paramsEvent({ seasonId: SEASON_ID, gameId: GAME_ID, uid: MEMBER }));

		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.counts.membersIn).toBe(1);
		expect(game?.counts.playing).toBe(1);
		// Only one of the two members has answered, so the game is still short.
		expect(game?.atRisk).toBe(true);
	});

	it('is not at risk once enough members are confirmed in', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER], minPlayers: 1 });
		await writeGame(SEASON_ID, GAME_ID);
		await writeResponse(SEASON_ID, GAME_ID, MEMBER, { status: 'in', role: 'member' });

		await onResponseWrite.run(paramsEvent({ seasonId: SEASON_ID, gameId: GAME_ID, uid: MEMBER }));

		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.atRisk).toBe(false);
	});

	it('queues a team rebuild carrying the bumped generation', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER], minPlayers: 1 });
		await writeGame(SEASON_ID, GAME_ID, { teamsGeneration: 4 });
		await writeResponse(SEASON_ID, GAME_ID, MEMBER);

		await onResponseWrite.run(paramsEvent({ seasonId: SEASON_ID, gameId: GAME_ID, uid: MEMBER }));

		expect(enqueue).toHaveBeenCalledWith({ seasonId: SEASON_ID, gameId: GAME_ID, generation: 5 });
	});

	// The counters describe what people answered, and a no-show answered In.
	// Nothing about the headcount moves, which is why nothing here has to know
	// the mark exists.
	it('leaves the headcount alone when somebody is reported as a no-show', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER], minPlayers: 1 });
		await writeGame(SEASON_ID, GAME_ID);
		await writeResponse(SEASON_ID, GAME_ID, MEMBER, { status: 'in', role: 'member', absent: true });

		await onResponseWrite.run(
			responseEvent(aResponse(MEMBER, { status: 'in' }), aResponse(MEMBER, { status: 'in', absent: true }))
		);

		expect((await readGame(SEASON_ID, GAME_ID))?.counts.playing).toBe(1);
	});

	it('does nothing when the season is gone', async () => {
		await writeGame(SEASON_ID, GAME_ID);

		await onResponseWrite.run(paramsEvent({ seasonId: SEASON_ID, gameId: GAME_ID, uid: MEMBER }));

		expect(enqueue).not.toHaveBeenCalled();
	});

	it('does nothing when the game is gone', async () => {
		await writeSeason(SEASON_ID);

		await onResponseWrite.run(paramsEvent({ seasonId: SEASON_ID, gameId: GAME_ID, uid: MEMBER }));

		expect(enqueue).not.toHaveBeenCalled();
	});
});

describe('telling watchers an answer moved', () => {
	beforeEach(async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER, OTHER_MEMBER], minPlayers: 2 });
		await writeGame(SEASON_ID, GAME_ID, upcoming());
		await writeUser(MEMBER, { displayName: 'Anna Berg' });
	});

	it('names who moved and which way, to whoever is following', async () => {
		await writeWatcher(WATCHER);
		await writeResponse(SEASON_ID, GAME_ID, MEMBER, { status: 'in' });
		const sent = captureSends();

		await onResponseWrite.run(responseEvent(undefined, aResponse(MEMBER, { status: 'in' })));

		expect(sent).toHaveBeenCalledWith(
			[WATCHER],
			'availability',
			expect.objectContaining({
				gameId: GAME_ID,
				url: `/s/${SEASON_ID}/g/${GAME_ID}`,
				who: 'Anna Berg',
				availability: 'in',
				// The count as the recount has just settled it, not the one the
				// game document was carrying when this fired.
				playing: 1,
			})
		);
	});

	it('calls a deleted response a withdrawal', async () => {
		await writeWatcher(WATCHER);
		const sent = captureSends();

		await onResponseWrite.run(responseEvent(aResponse(MEMBER, { status: 'in' }), undefined));

		expect(sent).toHaveBeenCalledWith(
			[WATCHER],
			'availability',
			expect.objectContaining({ availability: 'withdrawn' })
		);
	});

	// They are the one person who already knows.
	it('never tells the person who just answered', async () => {
		await writeWatcher(MEMBER);
		const sent = captureSends();

		await onResponseWrite.run(responseEvent(undefined, aResponse(MEMBER, { status: 'in' })));

		expect(sent).not.toHaveBeenCalled();
	});

	it('tells the other watchers even when the person who answered is following too', async () => {
		await writeWatcher(MEMBER);
		await writeWatcher(WATCHER);
		const sent = captureSends();

		await onResponseWrite.run(responseEvent(undefined, aResponse(MEMBER, { status: 'in' })));

		expect(sent).toHaveBeenCalledWith([WATCHER], 'availability', expect.anything());
	});

	// The whole point of the subscription being off by default.
	it('says nothing about a game nobody is following', async () => {
		const sent = captureSends();

		await onResponseWrite.run(responseEvent(undefined, aResponse(MEMBER, { status: 'in' })));

		expect(sent).not.toHaveBeenCalled();
	});

	// `setResponse` rewrites the whole document, so these arrive looking like an
	// answer. Saying "Anna is in" when Anna was already in is the notification
	// that gets the bell switched back off.
	it('stays quiet when the rewrite left the answer where it was', async () => {
		await writeWatcher(WATCHER);
		const sent = captureSends();

		await onResponseWrite.run(
			responseEvent(aResponse(MEMBER, { status: 'in' }), aResponse(MEMBER, { status: 'in', note: 'back by 7' }))
		);

		expect(sent).not.toHaveBeenCalled();
	});

	// A no-show is a mark beside the answer, not a change to it: `status` still
	// says In because that is what they said. The watcher who asked to hear
	// whether people are coming has already heard everything there is.
	it('stays quiet when an admin reports a no-show', async () => {
		await writeWatcher(WATCHER);
		const sent = captureSends();

		await onResponseWrite.run(
			responseEvent(aResponse(MEMBER, { status: 'in' }), aResponse(MEMBER, { status: 'in', absent: true }))
		);

		expect(sent).not.toHaveBeenCalled();
	});

	it('stays quiet on a game that has been called off', async () => {
		await writeGame(SEASON_ID, GAME_ID, { ...upcoming(), status: 'cancelled' });
		await writeWatcher(WATCHER);
		const sent = captureSends();

		await onResponseWrite.run(responseEvent(undefined, aResponse(MEMBER, { status: 'in' })));

		expect(sent).not.toHaveBeenCalled();
	});

	// An admin tidying the roster of a game that has already been played is
	// housekeeping, and the bell is gone from that screen by then anyway,
	// `isWatchable` is the one predicate both sides read.
	it('stays quiet on a game that has already been played', async () => {
		await writeGame(SEASON_ID, GAME_ID, alreadyPlayed());
		await writeWatcher(WATCHER);
		const sent = captureSends();

		await onResponseWrite.run(responseEvent(undefined, aResponse(MEMBER, { status: 'in' })));

		expect(sent).not.toHaveBeenCalled();
	});

	// Past the deadline only a season admin can move the roster, which is
	// exactly when somebody counting on a lift wants to hear that it moved.
	it('still tells watchers once answers have locked', async () => {
		await writeGame(SEASON_ID, GAME_ID, gameAt(Date.now() + HOUR));
		await writeWatcher(WATCHER);
		const sent = captureSends();

		await onResponseWrite.run(responseEvent(aResponse(MEMBER, { status: 'in' }), undefined));

		expect(sent).toHaveBeenCalledWith(
			[WATCHER],
			'availability',
			expect.objectContaining({ availability: 'withdrawn' })
		);
	});

	// A watcher follows one game, not the season.
	it('does not leak across games in the same season', async () => {
		await writeGame(SEASON_ID, 'game-2', upcoming());
		await writeWatcher(WATCHER, 'game-2');
		const sent = captureSends();

		await onResponseWrite.run(responseEvent(undefined, aResponse(MEMBER, { status: 'in' })));

		expect(sent).not.toHaveBeenCalled();
	});

	// A profile can legitimately be missing a name mid-write, and the copy
	// builder is what decides how that reads. This only has to not crash.
	it('still sends when the profile has no name on it', async () => {
		await getDb().doc(`users/${MEMBER}`).delete();
		await writeWatcher(WATCHER);
		const sent = captureSends();

		await onResponseWrite.run(responseEvent(undefined, aResponse(MEMBER, { status: 'in' })));

		expect(sent).toHaveBeenCalledWith([WATCHER], 'availability', expect.objectContaining({ who: '' }));
	});
});
