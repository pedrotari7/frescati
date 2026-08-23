import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import type { CountsDrift } from '../../shared/game';
import { findCountsDrift, getMinPlayers } from '../../shared/game';
import type { Game, Season } from '../../shared/types';
import { db, REGION } from './lib/firebase';
import { getResponses } from './lib/data';
import { DAILY, instrumentSchedule, reportError } from './lib/sentry';

/**
 * Checks that every upcoming game's stored counters still agree with the
 * responses underneath them.
 *
 * `counts` and `atRisk` are written only by `onResponseWrite`. That is a
 * background trigger, and the one thing a background trigger cannot do is tell
 * you it gave up: Firestore retries it, and when the retries run out the write
 * simply never happens. The game keeps the last total it managed to store, the
 * screens render that number, the reminder copy quotes it, and nothing anywhere
 * ever compares it against the documents it was derived from. The first symptom
 * is people turning up to a game whose headcount was wrong all week.
 *
 * `instrument` cannot see this, because nothing threw where anybody was
 * looking. Neither can the cron check-in, because the sweep that matters ran
 * fine. It was a trigger somewhere else that didn't. This is the third case:
 * state that is quietly wrong, which only a comparison finds.
 *
 * **It reports and does not repair.** `recountGames` is the repair and has been
 * all along; running it automatically here would clear the symptom every night
 * while the trigger carried on failing, and the evidence would be gone by
 * morning. It would also bump `teamsGeneration` on every game it touched, see
 * `recountGame`, queueing a rebuild off the back of a health check.
 *
 * Scoped to games that have not kicked off yet, in seasons that are still
 * active. A drifted counter on a game already played changes nothing: the
 * tournament result is what that game means now, and reporting it every night
 * forever would bury the one game somebody could still act on.
 */
export const auditGameCounts = onSchedule(
	{ schedule: 'every 24 hours', timeZone: 'Europe/Stockholm', region: REGION },
	// A day of margin: this finds problems that are already days old, so being
	// told about a late sweep the hour it slips would be noise about noise.
	instrumentSchedule('auditGameCounts', { schedule: DAILY, checkinMargin: 120, maxRuntime: 10 }, async () => {
		const seasonsSnap = await db.collection('seasons').where('status', '==', 'active').get();
		const drifted: DriftedGame[] = [];
		let checked = 0;

		for (const seasonDoc of seasonsSnap.docs) {
			try {
				const season = { ...seasonDoc.data(), id: seasonDoc.id } as Season;
				const result = await auditSeason(season);

				checked += result.checked;
				drifted.push(...result.drifted);
			} catch (error) {
				// One unreadable season must not cost every other season its
				// audit, the same way it must not cost them their reminders.
				reportError('Could not audit a season for counter drift', { seasonId: seasonDoc.id }, error);
			}
		}

		logger.info('Counter audit finished', { checked, drifted: drifted.length });

		if (drifted.length === 0) return;

		// One report for the whole sweep rather than one per game. A trigger
		// that has stopped working takes out every game it should have written,
		// so the per-game version would arrive as a wall of near-identical
		// issues saying one thing, and the number of games affected is the
		// most useful part of that one thing.
		reportError(
			`Stored counters disagree with the responses on ${drifted.length} of ${checked} upcoming games`,
			{ checked, drifted },
			new Error('Game counter drift')
		);
	})
);

interface DriftedGame {
	seasonId: string;
	gameId: string;
	kickoff: string;
	drift: CountsDrift[];
}

const auditSeason = async (season: Season): Promise<{ checked: number; drifted: DriftedGame[] }> => {
	// Scheduled and still ahead of us. Cancelled games are excluded by the
	// status filter, which is right: nobody is playing, so nothing depends on
	// the number.
	const gamesSnap = await db
		.collection(`seasons/${season.id}/games`)
		.where('status', '==', 'scheduled')
		.where('kickoff', '>=', new Date().toISOString())
		.get();

	const drifted: DriftedGame[] = [];

	for (const gameDoc of gamesSnap.docs) {
		const game = { ...gameDoc.data(), id: gameDoc.id } as Game;
		const responses = await getResponses(season.id, game.id);
		const drift = findCountsDrift(game, responses, getMinPlayers(game, season));

		if (drift.length > 0) drifted.push({ seasonId: season.id, gameId: game.id, kickoff: game.kickoff, drift });
	}

	return { checked: gamesSnap.size, drifted };
};
