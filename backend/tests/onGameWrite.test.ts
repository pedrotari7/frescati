vi.mock('../src/lib/teams', () => ({ enqueueTeamRebuild: vi.fn().mockResolvedValue(undefined) }));

import { onGameWrite } from '../src/onGameWrite';
import { enqueueTeamRebuild } from '../src/lib/teams';
import * as push from '../src/lib/push';
import {
	aGame,
	clearAuth,
	clearFirestore,
	readGame,
	writeGame,
	writeResponse,
	writeSeason,
	writtenEvent,
} from './helpers';
import type { Mock } from 'vitest';

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const MEMBER = 'member-1';
const OTHER_MEMBER = 'member-2';
const EXTRA = 'extra-1';

const enqueue = enqueueTeamRebuild as Mock;

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
	enqueue.mockClear();
});

// `vi.spyOn` reuses the same mock across calls on an already-spied method, so
// without this its call count would keep accumulating across tests in this file.
afterEach(() => vi.restoreAllMocks());

describe('onGameWrite', () => {
	it('ignores a creation', async () => {
		const sendSpy = vi.spyOn(push, 'sendGamePush');
		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, undefined, aGame()));

		expect(enqueue).not.toHaveBeenCalled();
		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('ignores a deletion', async () => {
		const sendSpy = vi.spyOn(push, 'sendGamePush');
		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, aGame(), undefined));

		expect(enqueue).not.toHaveBeenCalled();
		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('ignores a bare counts update', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER] });
		const sendSpy = vi.spyOn(push, 'sendGamePush');
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
		const sendSpy = vi.spyOn(push, 'sendGamePush');

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
		const sendSpy = vi.spyOn(push, 'sendGamePush');

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
		const sendSpy = vi.spyOn(push, 'sendGamePush');

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
		const sendSpy = vi.spyOn(push, 'sendGamePush');

		const before = aGame({ status: 'cancelled', atRisk: false });
		const after = aGame({ status: 'cancelled', atRisk: true });

		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, before, after));

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('notifies players who said in when kickoff moves', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER, OTHER_MEMBER] });
		await writeResponse(SEASON_ID, GAME_ID, MEMBER, { status: 'in', role: 'member' });
		await writeResponse(SEASON_ID, GAME_ID, OTHER_MEMBER, { status: 'out', role: 'member' });
		const sendSpy = vi.spyOn(push, 'sendGamePush');

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

		// `force`, because a reshuffle is somebody asking for different teams,
		// the one instruction that outranks a lineup they picked by hand earlier.
		expect(enqueue).toHaveBeenCalledWith({
			seasonId: SEASON_ID,
			gameId: GAME_ID,
			generation: 3,
			force: true,
		});
	});

	it('queues a team rebuild when the balance levers change', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER] });

		const before = aGame({ balance: { randomness: 0.3 } });
		const after = aGame({ balance: { randomness: 0.6 } });

		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, before, after));

		expect(enqueue).toHaveBeenCalledTimes(1);
	});
});

/**
 * The numeric mirror the response deadline is enforced against. No rule can
 * check it agrees with `kickoff`, because parsing the ISO form is the thing a
 * rule cannot do, which is why the mirror exists at all.
 */
describe('onGameWrite, keeping kickoffMillis in step', () => {
	const MOVED = '2026-09-08T17:00:00.000Z';

	it('corrects a mirror that disagrees with the kickoff it mirrors', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER] });
		await writeGame(SEASON_ID, GAME_ID, { kickoff: MOVED, kickoffMillis: Date.parse('2026-09-01T17:00:00.000Z') });

		const before = aGame();
		const after = aGame({ kickoff: MOVED, kickoffMillis: Date.parse('2026-09-01T17:00:00.000Z') });

		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, before, after));

		expect((await readGame(SEASON_ID, GAME_ID))?.kickoffMillis).toBe(Date.parse(MOVED));
	});

	// A creation can arrive already disagreeing, and that is the state the
	// deadline would then be enforced against for the game's whole life, so
	// the repair runs ahead of the guard that skips creations for notifications.
	it('corrects a game that was created already disagreeing', async () => {
		await writeGame(SEASON_ID, GAME_ID, { kickoff: MOVED, kickoffMillis: 0 });

		await onGameWrite.run(
			writtenEvent(
				{ seasonId: SEASON_ID, gameId: GAME_ID },
				undefined,
				aGame({ kickoff: MOVED, kickoffMillis: 0 })
			)
		);

		expect((await readGame(SEASON_ID, GAME_ID))?.kickoffMillis).toBe(Date.parse(MOVED));
	});

	// Otherwise the repair would rewrite the document on every `counts` update,
	// and each of those writes would trigger this again.
	it('writes nothing when the two already agree', async () => {
		await writeSeason(SEASON_ID, { memberUids: [MEMBER] });
		const game = await writeGame(SEASON_ID, GAME_ID);
		const before = (await readGame(SEASON_ID, GAME_ID))?.kickoffMillis;

		await onGameWrite.run(writtenEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, aGame(), game));

		expect((await readGame(SEASON_ID, GAME_ID))?.kickoffMillis).toBe(before);
		expect(console.warn).not.toHaveBeenCalledWith('Repaired a drifted kickoffMillis', expect.anything());
	});

	// `Date.parse` gives NaN, and writing that would fail the update outright,
	// so the mirror is left as it is rather than replaced with something worse.
	//
	// No season here on purpose, so the handler returns before it formats
	// anything: `formatGameWhen` throws on a kickoff it cannot parse, which is
	// its own problem and not this one.
	it('leaves a mirror alone when the kickoff cannot be parsed at all', async () => {
		await writeGame(SEASON_ID, GAME_ID, { kickoff: 'not a date', kickoffMillis: 123 });

		await onGameWrite.run(
			writtenEvent(
				{ seasonId: SEASON_ID, gameId: GAME_ID },
				aGame(),
				aGame({ kickoff: 'not a date', kickoffMillis: 123 })
			)
		);

		expect((await readGame(SEASON_ID, GAME_ID))?.kickoffMillis).toBe(123);
	});
});
