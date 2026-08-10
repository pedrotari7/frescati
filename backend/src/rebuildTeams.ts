import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { REGION } from './lib/firebase';
import { runTeamRebuild } from './lib/rebuild';
import type { TeamRebuildTask } from './lib/rebuild';
import { instrument } from './lib/sentry';

/**
 * Re-pick the teams for one game.
 *
 * Deliberately its own function rather than part of `onResponseWrite`: the
 * optimiser is the one piece of this app whose cost grows with the turnout, and
 * a slow game must never be able to hold up the headcount everybody is
 * actually looking at.
 *
 * The work itself lives in `lib/rebuild` so it can be run without a queue,
 * which is what the emulator does — Cloud Tasks has none.
 */
export const rebuildTeams = onTaskDispatched<TeamRebuildTask>(
	{
		region: REGION,
		retryConfig: { maxAttempts: 3, minBackoffSeconds: 10 },
		// One rebuild at a time per instance. There is no rush — the work is
		// already deferred — and this keeps a busy Sunday from fanning out.
		rateLimits: { maxConcurrentDispatches: 4 },
	},
	instrument('rebuildTeams', request => runTeamRebuild(request.data))
);
