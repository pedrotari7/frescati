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
