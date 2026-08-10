import { getFunctions } from 'firebase-admin/functions';
import { logger } from 'firebase-functions';
import { db, REGION } from './firebase';
import { runTeamRebuild } from './rebuild';
import type { TeamRebuildTask } from './rebuild';

/**
 * Queueing for the debounced team rebuild.
 *
 * Teams are re-picked whenever the playing pool moves, which during a burst of
 * answers on a Sunday evening means half a dozen changes in a minute. Rebuilding
 * on each one would be six full optimiser runs to produce five lineups nobody
 * ever saw.
 *
 * So each change queues a rebuild a few seconds out, carrying the generation it
 * was queued for. The handler drops itself if the game has moved on since —
 * meaning a burst leaves several queued tasks but only the last one does any
 * work. Cheaper than cancelling, and it needs no coordination.
 */

export const TEAM_REBUILD_QUEUE = 'rebuildTeams';

export type { TeamRebuildTask };

/**
 * Queues are addressed by resource name, and the region has to be part of it —
 * `taskQueue`'s second argument is an extension id, not a location, so passing
 * the region there would silently look for the queue in the default region and
 * never find it.
 */
const queueName = `locations/${REGION}/functions/${TEAM_REBUILD_QUEUE}`;

/**
 * Long enough to swallow a flurry of answers, short enough that somebody who
 * taps In and opens the teams screen sees themselves on it.
 */
const DEBOUNCE_SECONDS = 10;

/**
 * Shorter locally. The debounce still collapses a burst of taps, but nobody
 * testing a change wants to sit and count to ten every time they answer.
 */
const EMULATOR_DEBOUNCE_SECONDS = 2;

const isEmulated = (): boolean => process.env.FUNCTIONS_EMULATOR === 'true';

/**
 * Queue a rebuild.
 *
 * Never throws: a lineup that rebuilds late is a nuisance, whereas a throw here
 * would fail the response trigger and take the headcount down with it.
 *
 * **Cloud Tasks has no emulator.** Left alone, every local rebuild would fail
 * to queue and the teams screen would stay empty however many people answered —
 * which makes the whole tournament half of the app untestable against a local
 * database. So locally the same work runs in-process on the same kind of delay.
 * A timer rather than a queue means a rebuild is lost if the emulator restarts
 * mid-debounce; the next answer queues another, and it is a development
 * database.
 */
export const enqueueTeamRebuild = async (task: TeamRebuildTask): Promise<void> => {
	if (isEmulated()) {
		setTimeout(() => {
			// `{ error }` alone serialises an Error as `{}`, which is how a real
			// bug in here spent a while looking like an empty warning.
			runTeamRebuild(task).catch(error =>
				logger.warn('Local team rebuild failed', {
					...task,
					error: error instanceof Error ? error.stack : error,
				})
			);
		}, EMULATOR_DEBOUNCE_SECONDS * 1000);

		return;
	}

	try {
		await getFunctions()
			.taskQueue<TeamRebuildTask>(queueName)
			.enqueue(task, { scheduleDelaySeconds: DEBOUNCE_SECONDS });
	} catch (error) {
		logger.warn('Could not queue a team rebuild', { ...task, error });
	}
};

/**
 * Mark a game's lineup stale and queue the rebuild, without touching its
 * counters.
 *
 * Everything else that invalidates a lineup goes through `recountGame`, which
 * bumps the generation in the same transaction as the counts — because
 * everything else that invalidates a lineup moves the playing pool, and the
 * counters describe the pool. A rating change moves neither the pool nor the
 * counters, only what the optimizer thinks the pool is worth, so it needs the
 * marker bumped on its own.
 *
 * Transactional for the same reason the recount is: two of these racing would
 * otherwise settle on the same generation, and the second rebuild would drop
 * itself as superseded by a task that had already run.
 *
 * Silent on a game that has gone — the caller found it a moment ago through a
 * response that outlived it, and a cascade delete is on its way to that too.
 */
export const invalidateTeams = async (seasonId: string, gameId: string): Promise<void> => {
	const gameRef = db.doc(`seasons/${seasonId}/games/${gameId}`);

	const generation = await db.runTransaction(async transaction => {
		const gameSnap = await transaction.get(gameRef);

		if (!gameSnap.exists) return null;

		const next = ((gameSnap.data() as { teamsGeneration?: number }).teamsGeneration ?? 0) + 1;
		transaction.update(gameRef, { teamsGeneration: next });

		return next;
	});

	if (generation === null) return;

	await enqueueTeamRebuild({ seasonId, gameId, generation });
};
