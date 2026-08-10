jest.mock('../src/lib/teams', () => ({ enqueueTeamRebuild: jest.fn().mockResolvedValue(undefined) }));

import { onSeasonWrite } from '../src/onSeasonWrite';
import { enqueueTeamRebuild } from '../src/lib/teams';
import {
	aSeason,
	clearAuth,
	clearFirestore,
	readGame,
	readResponse,
	writeGame,
	writeResponse,
	writtenEvent,
} from './helpers';

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const MEMBER = 'member-1';
const NEW_MEMBER = 'member-2';

const enqueue = enqueueTeamRebuild as jest.Mock;

const inTheFuture = new Date(Date.now() + 24 * 3_600_000).toISOString();
const inThePast = new Date(Date.now() - 24 * 3_600_000).toISOString();

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
	enqueue.mockClear();
});

describe('onSeasonWrite', () => {
	it('repairs a stale role and recounts future games when the roster changes', async () => {
		await writeGame(SEASON_ID, GAME_ID, { kickoff: inTheFuture });
		// Answered while still an extra; the roster below promotes them mid-season.
		await writeResponse(SEASON_ID, GAME_ID, NEW_MEMBER, { status: 'in', role: 'extra' });

		const before = aSeason({ memberUids: [MEMBER] });
		const after = aSeason({ memberUids: [MEMBER, NEW_MEMBER] });

		await onSeasonWrite.run(writtenEvent({ seasonId: SEASON_ID }, before, after));

		const response = await readResponse(SEASON_ID, GAME_ID, NEW_MEMBER);
		expect(response?.role).toBe('member');

		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.counts.membersIn).toBe(1);
		expect(game?.counts.extrasIn).toBe(0);

		expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ seasonId: SEASON_ID, gameId: GAME_ID }));
	});

	it('leaves games alone when the roster is unchanged', async () => {
		await writeGame(SEASON_ID, GAME_ID, { kickoff: inTheFuture });
		await writeResponse(SEASON_ID, GAME_ID, MEMBER, { status: 'in', role: 'extra' });

		const before = aSeason({ memberUids: [NEW_MEMBER, MEMBER] });
		const after = aSeason({ memberUids: [MEMBER, NEW_MEMBER] });

		await onSeasonWrite.run(writtenEvent({ seasonId: SEASON_ID }, before, after));

		// Same members in a different order — `role` is left exactly as stale as
		// it was, because nothing about who is on the roster actually moved.
		const response = await readResponse(SEASON_ID, GAME_ID, MEMBER);
		expect(response?.role).toBe('extra');
		expect(enqueue).not.toHaveBeenCalled();
	});

	it('ignores games that have already kicked off', async () => {
		await writeGame(SEASON_ID, GAME_ID, { kickoff: inThePast });
		await writeResponse(SEASON_ID, GAME_ID, NEW_MEMBER, { status: 'in', role: 'extra' });

		const before = aSeason({ memberUids: [MEMBER] });
		const after = aSeason({ memberUids: [MEMBER, NEW_MEMBER] });

		await onSeasonWrite.run(writtenEvent({ seasonId: SEASON_ID }, before, after));

		const response = await readResponse(SEASON_ID, GAME_ID, NEW_MEMBER);
		expect(response?.role).toBe('extra');
		expect(enqueue).not.toHaveBeenCalled();
	});

	it('ignores a creation', async () => {
		await onSeasonWrite.run(writtenEvent({ seasonId: SEASON_ID }, undefined, aSeason()));
		expect(enqueue).not.toHaveBeenCalled();
	});

	it('ignores a deletion', async () => {
		await onSeasonWrite.run(writtenEvent({ seasonId: SEASON_ID }, aSeason(), undefined));
		expect(enqueue).not.toHaveBeenCalled();
	});
});

/**
 * Only a response written by somebody whose membership moved can hold a stale
 * role, so the work should follow the diff rather than the calendar. This used
 * to recount every future game unconditionally, which made the ordinary
 * first-run sequence — generate a calendar, then add the squad one tap at a
 * time — quadratic.
 */
describe('onSeasonWrite, only touching what the change could have affected', () => {
	const addMember = (uid: string) =>
		onSeasonWrite.run(
			writtenEvent({ seasonId: SEASON_ID }, aSeason({ memberUids: [MEMBER] }), aSeason({ memberUids: [MEMBER, uid] }))
		);

	it('does nothing at all when the new member has answered nothing', async () => {
		for (const index of [1, 2, 3]) {
			await writeGame(SEASON_ID, `game-${index}`, { kickoff: inTheFuture });
		}

		await addMember(NEW_MEMBER);

		expect(enqueue).not.toHaveBeenCalled();
		// Untouched, not merely unchanged: no transaction ran, so the staleness
		// marker the debounced rebuild reads never moved either.
		expect((await readGame(SEASON_ID, 'game-1'))?.teamsGeneration).toBeUndefined();
	});

	it('repairs only the games the new member had answered', async () => {
		for (const index of [1, 2, 3]) {
			await writeGame(SEASON_ID, `game-${index}`, { kickoff: inTheFuture });
		}
		await writeResponse(SEASON_ID, 'game-2', NEW_MEMBER, { status: 'in', role: 'extra' });

		await addMember(NEW_MEMBER);

		expect(enqueue).toHaveBeenCalledTimes(1);
		expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ gameId: 'game-2' }));

		expect((await readResponse(SEASON_ID, 'game-2', NEW_MEMBER))?.role).toBe('member');
		expect((await readGame(SEASON_ID, 'game-1'))?.teamsGeneration).toBeUndefined();
		expect((await readGame(SEASON_ID, 'game-3'))?.teamsGeneration).toBeUndefined();
	});

	// Somebody else's answers are not made stale by a third party joining, so a
	// game full of other people's responses is still none of this change's
	// business.
	it('leaves a game alone when only other people have answered it', async () => {
		await writeGame(SEASON_ID, GAME_ID, { kickoff: inTheFuture });
		await writeResponse(SEASON_ID, GAME_ID, MEMBER, { status: 'in', role: 'member' });

		await addMember(NEW_MEMBER);

		expect(enqueue).not.toHaveBeenCalled();
	});

	it('follows somebody being removed as well as added', async () => {
		await writeGame(SEASON_ID, GAME_ID, { kickoff: inTheFuture });
		await writeResponse(SEASON_ID, GAME_ID, NEW_MEMBER, { status: 'in', role: 'member' });

		await onSeasonWrite.run(
			writtenEvent(
				{ seasonId: SEASON_ID },
				aSeason({ memberUids: [MEMBER, NEW_MEMBER] }),
				aSeason({ memberUids: [MEMBER] })
			)
		);

		expect((await readResponse(SEASON_ID, GAME_ID, NEW_MEMBER))?.role).toBe('extra');
		expect((await readGame(SEASON_ID, GAME_ID))?.counts.membersIn).toBe(0);
		expect(enqueue).toHaveBeenCalledTimes(1);
	});

	// The collection-group query comes back across every season, so the filter
	// back down to this one is load-bearing.
	it('ignores an answer the same person gave in a different season', async () => {
		await writeGame(SEASON_ID, GAME_ID, { kickoff: inTheFuture });
		await writeGame('season-2', 'other-game', { kickoff: inTheFuture });
		await writeResponse('season-2', 'other-game', NEW_MEMBER, { status: 'in', role: 'extra' });

		await addMember(NEW_MEMBER);

		expect(enqueue).not.toHaveBeenCalled();
		expect((await readResponse('season-2', 'other-game', NEW_MEMBER))?.role).toBe('extra');
	});
});
