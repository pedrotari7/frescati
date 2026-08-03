jest.mock('../src/lib/teams', () => ({ enqueueTeamRebuild: jest.fn().mockResolvedValue(undefined) }));

import { onResponseWrite } from '../src/onResponseWrite';
import { enqueueTeamRebuild } from '../src/lib/teams';
import { clearAuth, clearFirestore, paramsEvent, readGame, writeGame, writeResponse, writeSeason } from './helpers';

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const MEMBER = 'member-1';
const OTHER_MEMBER = 'member-2';

const enqueue = enqueueTeamRebuild as jest.Mock;

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
	enqueue.mockClear();
});

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
