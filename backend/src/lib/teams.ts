import { getFunctions } from 'firebase-admin/functions';
import { logger } from 'firebase-functions';
import { REGION } from './firebase';
import { runTeamRebuild } from './rebuild';
import type { TeamRebuildTask } from './rebuild';

/**
 * Queueing for the debounced team rebuild.
 *
 * Teams are re-picked whenever the playing pool moves, which during a burst of
 * answers on a Sunday night means half a dozen changes in a minute. Rebuilding
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
			runTeamRebuild(task).catch(error => logger.warn('Local team rebuild failed', { ...task, error }));
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
