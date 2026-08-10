import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import type { Game } from '../../shared/types';
import { getSilentMembers } from '../../shared/game';
import { formatGameWhen } from '../../shared/format';
import { db, REGION } from './lib/firebase';
import { getResponses, getSeason, getUidsWhoSaidIn } from './lib/data';
import { EMAIL_SECRETS } from './lib/email';
import { sendGamePush } from './lib/push';
import { enqueueTeamRebuild } from './lib/teams';
import { instrument, reportError } from './lib/sentry';

/**
 * Keeps the numeric mirror in step with the instant it mirrors.
 *
 * `kickoffMillis` exists because a security rule cannot parse the ISO 8601
 * `kickoff`, and the response deadline has to be enforced against *something*.
 * Which is exactly why no rule can check the two agree either — the parse it
 * would need is the one it can't do. So the agreement is repaired here rather
 * than trusted.
 *
 * Drift runs one way that matters: `kickoff` moving earlier while the mirror
 * stays put leaves responses open past the real deadline, and that deadline is
 * the one thing rules actually enforce on this document.
 *
 * Nothing in the app writes `kickoff` after creation today, so this defends a
 * console edit — and the reschedule feature the `kickoffMoved` notification
 * below is already written for, whenever it arrives.
 */
const repairKickoffMirror = async (seasonId: string, gameId: string, game: Game): Promise<void> => {
	const expected = Date.parse(game.kickoff);

	// An unparseable kickoff has nothing to mirror, and writing NaN would fail
	// the update outright. Nothing should produce one; if something does, the
	// drift is the smaller of the two problems.
	if (!Number.isFinite(expected) || game.kickoffMillis === expected) return;

	try {
		await db.doc(`seasons/${seasonId}/games/${gameId}`).update({ kickoffMillis: expected });

		logger.warn('Repaired a drifted kickoffMillis', { seasonId, gameId, was: game.kickoffMillis, now: expected });
	} catch (error) {
		// Deleted between the write and this running, most likely. Not worth
		// failing the notifications this trigger is mainly here to send.
		reportError('Could not repair a drifted kickoffMillis', { seasonId, gameId }, error);
	}
};

/**
 * Tells people when something about a game changes under them.
 *
 * Reads the game document and, in one case only, writes it: `repairKickoffMirror`
 * above. That is deliberate and it converges — the repaired value satisfies the
 * condition, so the invocation it causes does nothing — and it cannot re-send a
 * notification, because that second invocation sees an unchanged `kickoff`, an
 * unchanged `atRisk` and an unchanged `reshuffleCount`. Nothing else here writes,
 * and nothing else should: this fires on every `counts` update from
 * `onResponseWrite` as well.
 */
export const onGameWrite = onDocumentWritten(
	{ document: 'seasons/{seasonId}/games/{gameId}', region: REGION, secrets: EMAIL_SECRETS },
	instrument('onGameWrite', async event => {
		const before = event.data?.before.data() as Game | undefined;
		const after = event.data?.after.data() as Game | undefined;
		const { seasonId, gameId } = event.params;

		// Ahead of the notification guard below, because a game can be created
		// with the two already disagreeing — and that is the state the response
		// deadline would then be enforced against for its whole life.
		if (after) await repairKickoffMirror(seasonId, gameId, after);

		// Creations and deletions aren't worth a notification.
		if (!before || !after) return;

		// An admin hitting Reshuffle, or moving this game's balance levers. Both
		// change the lineup without touching the pool, so `onResponseWrite`
		// never sees them.
		//
		// Queued against the generation as it already stands rather than bumping
		// it. A bump is a write to this very document, and unlike the kickoff
		// repair above it would not converge: every bump invalidates the rebuild
		// it just queued, so the next invocation would bump again.
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
	})
);
