jest.mock('../src/lib/rebuild', () => ({ runTeamRebuild: jest.fn().mockResolvedValue(undefined) }));

import { logger } from 'firebase-functions';
import { getFunctions } from 'firebase-admin/functions';
import { runTeamRebuild } from '../src/lib/rebuild';
import { enqueueTeamRebuild, invalidateTeams, TEAM_REBUILD_QUEUE } from '../src/lib/teams';
import * as sentry from '../src/lib/sentry';
import { REGION } from '../src/lib/firebase';
import { clearAuth, clearFirestore, getDb, writeGame, writeSeason } from './helpers';

/**
 * How a rebuild gets queued — the half of the tournament wiring that no other
 * test reaches.
 *
 * `runTeamRebuild` is covered thoroughly in rebuildTeams.test.ts, and all three
 * triggers that queue one mock this module out wholesale so they can assert
 * *that* they queued. Between the two, the queueing itself is exercised by
 * nobody: the branch, the queue name, the delay, and what happens when the
 * queue refuses.
 *
 * So `runTeamRebuild` is mocked here too, deliberately. What is under test is
 * the scheduling around it, and composing that with the rebuild's own tests is
 * both the honest split and the robust one — a real rebuild would drag real
 * Firestore I/O through fake timers to prove something already proven.
 *
 * The local branch is the one that had no coverage at all, and it is the one
 * every developer depends on: Cloud Tasks has no emulator, so `pnpm dev:seeded`
 * gets its lineups from the timer below and nothing else. It fails as a
 * `logger.warn`, which is exactly as loud as silence.
 */

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const task = { seasonId: SEASON_ID, gameId: GAME_ID, generation: 4 };

const rebuild = runTeamRebuild as jest.MockedFunction<typeof runTeamRebuild>;

/** Swapped in for whichever branch a test wants, and put back afterwards. */
const setEmulated = (emulated: boolean): (() => void) => {
	const saved = process.env.FUNCTIONS_EMULATOR;

	if (emulated) process.env.FUNCTIONS_EMULATOR = 'true';
	else delete process.env.FUNCTIONS_EMULATOR;

	return () => {
		if (saved === undefined) delete process.env.FUNCTIONS_EMULATOR;
		else process.env.FUNCTIONS_EMULATOR = saved;
	};
};

/** A stand-in for the Cloud Tasks queue, and the enqueue call it received. */
const stubQueue = (behaviour: { rejectsWith?: Error } = {}) => {
	const enqueue = jest.fn(async () => {
		if (behaviour.rejectsWith) throw behaviour.rejectsWith;
	});
	const taskQueue = jest.fn(() => ({ enqueue }));

	(getFunctions as jest.Mock).mockReturnValue({ taskQueue });

	return { taskQueue, enqueue };
};

jest.mock('firebase-admin/functions', () => ({ getFunctions: jest.fn() }));

beforeEach(() => {
	rebuild.mockClear();
	rebuild.mockResolvedValue(undefined);
});

describe('queueing a rebuild locally, where Cloud Tasks does not exist', () => {
	let restore: () => void;

	beforeEach(() => {
		restore = setEmulated(true);
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		restore();
	});

	it('runs the rebuild in-process once the debounce is up', async () => {
		await enqueueTeamRebuild(task);

		// Nothing yet: the whole point is to collapse a burst of answers.
		expect(rebuild).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(2000);

		expect(rebuild).toHaveBeenCalledWith(task);
	});

	it('never touches the task queue, which would fail every time', async () => {
		const { taskQueue } = stubQueue();

		await enqueueTeamRebuild(task);
		await jest.advanceTimersByTimeAsync(2000);

		expect(taskQueue).not.toHaveBeenCalled();
	});

	it('collapses a burst into one rebuild per answer, each on its own timer', async () => {
		// Three answers in quick succession queue three rebuilds; the handler
		// drops the superseded ones by generation, which is its job rather than
		// this one's. What matters here is that all three actually fire.
		await enqueueTeamRebuild({ ...task, generation: 1 });
		await enqueueTeamRebuild({ ...task, generation: 2 });
		await enqueueTeamRebuild({ ...task, generation: 3 });

		await jest.advanceTimersByTimeAsync(2000);

		expect(rebuild).toHaveBeenCalledTimes(3);
		expect(rebuild).toHaveBeenLastCalledWith({ ...task, generation: 3 });
	});

	it('logs a failed rebuild with a readable stack rather than an empty object', async () => {
		const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
		rebuild.mockRejectedValueOnce(new Error('optimizer blew up'));

		await enqueueTeamRebuild(task);
		await jest.advanceTimersByTimeAsync(2000);

		// `{ error }` alone serialises an Error as `{}`, which is how a real bug
		// in here once spent a while looking like an empty warning.
		expect(warn).toHaveBeenCalledWith('Local team rebuild failed', {
			...task,
			error: expect.stringContaining('optimizer blew up'),
		});
	});

	it('logs something thrown that was never an Error as-is', async () => {
		const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
		// No `.stack` to reach for. Passing it through beats logging `undefined`,
		// which is the same empty warning by another route.
		rebuild.mockRejectedValueOnce('optimizer blew up');

		await enqueueTeamRebuild(task);
		await jest.advanceTimersByTimeAsync(2000);

		expect(warn).toHaveBeenCalledWith('Local team rebuild failed', { ...task, error: 'optimizer blew up' });
	});

	it('does not let a failed rebuild reject into the trigger that queued it', async () => {
		rebuild.mockRejectedValueOnce(new Error('optimizer blew up'));
		jest.spyOn(logger, 'warn').mockImplementation(() => {});

		await expect(enqueueTeamRebuild(task)).resolves.toBeUndefined();
		await expect(jest.advanceTimersByTimeAsync(2000)).resolves.toBeUndefined();
	});
});

describe('queueing a rebuild as deployed', () => {
	let restore: () => void;

	beforeEach(() => {
		restore = setEmulated(false);
	});

	afterEach(() => restore());

	it('addresses the queue by resource name, region included', async () => {
		const { taskQueue, enqueue } = stubQueue();

		await enqueueTeamRebuild(task);

		// `taskQueue`'s second argument is an extension id, not a location, so a
		// region passed there would look in the default region and never find it.
		expect(taskQueue).toHaveBeenCalledWith(`locations/${REGION}/functions/${TEAM_REBUILD_QUEUE}`);
		expect(enqueue).toHaveBeenCalledWith(task, { scheduleDelaySeconds: 10 });
	});

	it('does not run the rebuild in-process', async () => {
		stubQueue();

		await enqueueTeamRebuild(task);

		expect(rebuild).not.toHaveBeenCalled();
	});

	it('reports a refused queue instead of throwing, so the headcount survives', async () => {
		// A misconfigured queue — wrong region, IAM, quota — would otherwise fail
		// the response trigger that queued it and take `counts` down with it. A
		// lineup that rebuilds late is a nuisance; a headcount that stops
		// updating is the app not working.
		const report = jest.spyOn(sentry, 'reportError').mockImplementation(() => {});
		const refused = new Error('PERMISSION_DENIED');
		stubQueue({ rejectsWith: refused });

		await expect(enqueueTeamRebuild(task)).resolves.toBeUndefined();

		expect(report).toHaveBeenCalledWith('Could not queue a team rebuild', { ...task }, refused);
	});
});

describe('invalidateTeams', () => {
	let restore: () => void;

	beforeEach(async () => {
		restore = setEmulated(false);
		await clearFirestore();
		await clearAuth();
	});

	afterEach(() => restore());

	const generationOf = async (): Promise<number | undefined> => {
		const snapshot = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}`).get();

		return (snapshot.data() as { teamsGeneration?: number } | undefined)?.teamsGeneration;
	};

	it('bumps the generation and queues that same generation', async () => {
		const { enqueue } = stubQueue();
		await writeSeason(SEASON_ID);
		await writeGame(SEASON_ID, GAME_ID, { teamsGeneration: 7 });

		await invalidateTeams(SEASON_ID, GAME_ID);

		expect(await generationOf()).toBe(8);
		// Queueing the generation it just wrote is what lets the handler drop
		// itself when a later answer has moved on.
		expect(enqueue).toHaveBeenCalledWith(
			{ seasonId: SEASON_ID, gameId: GAME_ID, generation: 8 },
			expect.anything()
		);
	});

	it('starts a game that has never had a lineup at generation 1', async () => {
		const { enqueue } = stubQueue();
		await writeSeason(SEASON_ID);
		await writeGame(SEASON_ID, GAME_ID);

		await invalidateTeams(SEASON_ID, GAME_ID);

		expect(await generationOf()).toBe(1);
		expect(enqueue).toHaveBeenCalledWith(
			{ seasonId: SEASON_ID, gameId: GAME_ID, generation: 1 },
			expect.anything()
		);
	});

	it('is silent on a game that has gone', async () => {
		const { enqueue } = stubQueue();

		// The caller found it a moment ago through a response that outlived it,
		// and a cascade delete is on its way to that too.
		await expect(invalidateTeams(SEASON_ID, 'ghost-game')).resolves.toBeUndefined();

		expect(enqueue).not.toHaveBeenCalled();
	});
});
