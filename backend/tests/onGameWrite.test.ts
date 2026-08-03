jest.mock('../src/lib/teams', () => ({ enqueueTeamRebuild: jest.fn().mockResolvedValue(undefined) }));

import { onGameWrite } from '../src/onGameWrite';
import { enqueueTeamRebuild } from '../src/lib/teams';
import * as push from '../src/lib/push';
import { aGame, clearAuth, clearFirestore, writeResponse, writeSeason, writtenEvent } from './helpers';

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const MEMBER = 'member-1';
const OTHER_MEMBER = 'member-2';
const EXTRA = 'extra-1';

const enqueue = enqueueTeamRebuild as jest.Mock;

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
	enqueue.mockClear();
});

// `jest.spyOn` reuses the same mock across calls on an already-spied method, so
// without this its call count would keep accumulating across tests in this file.
afterEach(() => jest.restoreAllMocks());

describe('onGameWrite', () => {
	it('ignores a creation', async () => {
		const sendSpy = jest.spyOn(push, 'sendGamePush');
		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, undefined, aGame()));

		expect(enqueue).not.toHaveBeenCalled();
		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('ignores a deletion', async () => {
		const sendSpy = jest.spyOn(push, 'sendGamePush');
		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, aGame(), undefined));

		expect(enqueue).not.toHaveBeenCalled();
		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('ignores a bare counts update', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER] });
		const sendSpy = jest.spyOn(push, 'sendGamePush');
		const before = aGame();
		const after = aGame({ counts: { ...before.counts, membersIn: 1, playing: 1 } });

		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, before, after));

		expect(enqueue).not.toHaveBeenCalled();
		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('notifies everyone who answered when a game is cancelled', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER, OTHER_MEMBER] });
		await writeResponse(SEASON_ID, GAME_ID, MEMBER, { status: 'in', role: 'member' });
		await writeResponse(SEASON_ID, GAME_ID, EXTRA, { status: 'out', role: 'extra' });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		const before = aGame({ status: 'scheduled' });
		const after = aGame({ status: 'cancelled', cancelledReason: 'Waterlogged pitch' });

		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, before, after));

		expect(sendSpy).toHaveBeenCalledWith(
			expect.arrayContaining([MEMBER, EXTRA]),
			'cancelled',
			expect.objectContaining({ gameId: GAME_ID, cancelledReason: 'Waterlogged pitch' })
		);
	});

	it('notifies every member when a cancelled game is restored', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER, OTHER_MEMBER] });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		const before = aGame({ status: 'cancelled' });
		const after = aGame({ status: 'scheduled' });

		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, before, after));

		expect(sendSpy).toHaveBeenCalledWith(
			[MEMBER, OTHER_MEMBER],
			'restored',
			expect.objectContaining({ gameId: GAME_ID })
		);
	});

	it('notifies silent members once a game becomes at risk', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER, OTHER_MEMBER], minPlayers: 5 });
		await writeResponse(SEASON_ID, GAME_ID, MEMBER, { status: 'in', role: 'member' });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		const before = aGame({
			atRisk: false,
			counts: { membersIn: 5, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 5 },
		});
		const after = aGame({
			atRisk: true,
			counts: { membersIn: 1, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 1 },
		});

		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, before, after));

		expect(sendSpy).toHaveBeenCalledWith(
			[OTHER_MEMBER],
			'atRisk',
			expect.objectContaining({ gameId: GAME_ID, shortBy: 4 })
		);
	});

	it('does not flag at risk for a cancelled game', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER] });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		const before = aGame({ status: 'cancelled', atRisk: false });
		const after = aGame({ status: 'cancelled', atRisk: true });

		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, before, after));

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('notifies players who said in when kickoff moves', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER, OTHER_MEMBER] });
		await writeResponse(SEASON_ID, GAME_ID, MEMBER, { status: 'in', role: 'member' });
		await writeResponse(SEASON_ID, GAME_ID, OTHER_MEMBER, { status: 'out', role: 'member' });
		const sendSpy = jest.spyOn(push, 'sendGamePush');

		const before = aGame({ kickoff: '2026-09-01T17:00:00.000Z' });
		const after = aGame({ kickoff: '2026-09-02T17:00:00.000Z' });

		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, before, after));

		expect(sendSpy).toHaveBeenCalledWith([MEMBER], 'kickoffMoved', expect.objectContaining({ gameId: GAME_ID }));
	});

	it('queues a team rebuild when an admin reshuffles', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER] });

		const before = aGame({ reshuffleCount: 0, teamsGeneration: 3 });
		const after = aGame({ reshuffleCount: 1, teamsGeneration: 3 });

		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, before, after));

		expect(enqueue).toHaveBeenCalledWith({ seasonId: SEASON_ID, gameId: GAME_ID, generation: 3 });
	});

	it('queues a team rebuild when the balance levers change', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER] });

		const before = aGame({ balance: { randomness: 0.3 } });
		const after = aGame({ balance: { randomness: 0.6 } });

		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, before, after));

		expect(enqueue).toHaveBeenCalledTimes(1);
	});
});
