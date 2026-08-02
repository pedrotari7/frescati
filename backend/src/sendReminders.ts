import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import type { Game, Season } from '../../shared/types';
import { formatGameWhen } from '../../shared/format';
import { db, REGION } from './lib/firebase';
import { getResponses, getSilentMembers } from './lib/data';
import { sendPush } from './lib/push';

/**
 * Nudges squad members who haven't answered yet.
 *
 * Runs hourly and works out which of a season's `reminderHours` windows a game
 * has just entered. Each window is recorded in `remindersSent` on the game, so
 * an hourly schedule sends each reminder exactly once instead of every hour for
 * three days.
 */
export const sendReminders = onSchedule(
	{ schedule: 'every 60 minutes', timeZone: 'Europe/Stockholm', region: REGION },
	async () => {
		const now = Date.now();

		const seasonsSnap = await db.collection('seasons').where('status', '==', 'active').get();
		let totalSent = 0;

		for (const seasonDoc of seasonsSnap.docs) {
			try {
				totalSent += await remindSeason({ ...seasonDoc.data(), id: seasonDoc.id } as Season, now);
			} catch (error) {
				// One malformed season must not cost every other season its
				// reminders for the hour. Nothing retries this — the schedule is
				// the retry, and the next run is an hour of silence away.
				logger.error('Could not sweep a season for reminders', { seasonId: seasonDoc.id, error });
			}
		}

		logger.info('Reminder sweep finished', { notificationsSent: totalSent });
	}
);

/** Returns how many notifications went out for this season. */
const remindSeason = async (season: Season, now: number): Promise<number> => {
	// A season saved before `reminderHours` existed, or hand-edited without it,
	// used to throw here and take the whole sweep down with it.
	const reminderHours = season.reminderHours ?? [];
	if (reminderHours.length === 0) return 0;

	const furthestOut = Math.max(...reminderHours);
	let sent = 0;

	// Only games between now and the earliest reminder window can possibly be
	// due, so the query stays small however long the season is.
	const gamesSnap = await db
		.collection(`seasons/${season.id}/games`)
		.where('status', '==', 'scheduled')
		.where('kickoff', '>=', new Date(now).toISOString())
		.where('kickoff', '<=', new Date(now + furthestOut * 3_600_000).toISOString())
		.get();

	for (const gameDoc of gamesSnap.docs) {
		try {
			const game = { ...gameDoc.data(), id: gameDoc.id } as Game;
			const alreadySent = game.remindersSent ?? [];
			const hoursUntil = (new Date(game.kickoff).getTime() - now) / 3_600_000;

			// The largest window we've crossed but not yet sent. Taking the
			// largest means a missed run collapses into one reminder rather
			// than firing every skipped window at once.
			const due = reminderHours
				.filter(hours => hoursUntil <= hours && !alreadySent.includes(hours))
				.sort((a, b) => b - a)[0];

			if (due === undefined) continue;

			const responses = await getResponses(season.id, game.id);
			const silent = getSilentMembers(season, responses);

			if (silent.length > 0) {
				sent += await sendPush(
					silent,
					{
						title: 'Are you playing?',
						body: `${formatGameWhen(game.kickoff, season.slot.timezone)} — ${game.counts?.playing ?? 0} in so far.`,
						url: `/s/${season.id}/g/${game.id}`,
						tag: `game-${game.id}`,
					},
					'reminders'
				);
			}

			// Record every window we've now passed, not just the one sent, so
			// a skipped run doesn't fire late reminders on the next pass.
			const passed = reminderHours.filter(hours => hoursUntil <= hours);
			await gameDoc.ref.update({ remindersSent: Array.from(new Set([...alreadySent, ...passed])) });
		} catch (error) {
			// Same reasoning one level down: a single unreadable game shouldn't
			// cost the rest of the season its nudges.
			logger.error('Could not send reminders for a game', { seasonId: season.id, gameId: gameDoc.id, error });
		}
	}

	return sent;
};
