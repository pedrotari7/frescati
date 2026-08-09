import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import type { Game } from '../../shared/types';
import { formatGameWhen } from '../../shared/format';
import { REGION } from './lib/firebase';
import { getResponses, getSeason, getSilentMembers, getUidsWhoSaidIn } from './lib/data';
import { EMAIL_SECRETS } from './lib/email';
import { sendGamePush } from './lib/push';
import { enqueueTeamRebuild } from './lib/teams';

/**
 * Tells people when something about a game changes under them.
 *
 * Only reads the game document, never writes it — otherwise this would retrigger
 * itself, and it also fires on every `counts` update from `onResponseWrite`.
 */
export const onGameWrite = onDocumentWritten(
	{ document: 'seasons/{seasonId}/games/{gameId}', region: REGION, secrets: EMAIL_SECRETS },
	async event => {
		const before = event.data?.before.data() as Game | undefined;
		const after = event.data?.after.data() as Game | undefined;

		// Creations and deletions aren't worth a notification.
		if (!before || !after) return;

		const { seasonId, gameId } = event.params;

		// An admin hitting Reshuffle, or moving this game's balance levers. Both
		// change the lineup without touching the pool, so `onResponseWrite`
		// never sees them.
		//
		// Queued against the generation as it already stands rather than bumping
		// it: a bump would be a write to this very document, and this trigger
		// deliberately never writes the game it fires on.
		if (
			before.reshuffleCount !== after.reshuffleCount ||
			JSON.stringify(before.balance) !== JSON.stringify(after.balance)
		) {
			await enqueueTeamRebuild({ seasonId, gameId, generation: after.teamsGeneration ?? 0 });
		}

		const season = await getSeason(seasonId);
		if (!season) return;

		const when = formatGameWhen(after.kickoff, season.slot.timezone);
		const url = `/s/${seasonId}/g/${gameId}`;
		const responses = await getResponses(seasonId, gameId);

		if (before.status !== 'cancelled' && after.status === 'cancelled') {
			// Everyone who answered either way cared enough to want to know.
			const affected = responses.map(response => response.uid);

			const sent = await sendGamePush(affected, 'cancelled', {
				when,
				url,
				gameId,
				cancelledReason: after.cancelledReason,
			});

			logger.info('Notified players of a cancellation', { seasonId, gameId, ...sent });
			return;
		}

		if (before.status === 'cancelled' && after.status === 'scheduled') {
			const sent = await sendGamePush(season.memberUids, 'restored', { when, url, gameId });

			logger.info('Notified players a game was restored', { seasonId, gameId, ...sent });
			return;
		}

		// Only on the transition into trouble — `counts` updates land here
		// constantly, and a push on each one would be unbearable.
		if (!before.atRisk && after.atRisk && after.status === 'scheduled') {
			const silent = getSilentMembers(season, responses);
			const shortBy = Math.max(0, (after.minPlayers ?? season.minPlayers) - after.counts.playing);

			const sent = await sendGamePush(silent, 'atRisk', { when, url, gameId, shortBy });

			logger.info('Notified silent members a game is at risk', { seasonId, gameId, ...sent });
			return;
		}

		// Rescheduling matters to anyone who already committed.
		if (before.kickoff !== after.kickoff && after.status === 'scheduled') {
			const sent = await sendGamePush(getUidsWhoSaidIn(responses), 'kickoffMoved', { when, url, gameId });

			logger.info('Notified players of a reschedule', { seasonId, gameId, ...sent });
		}
	}
);
