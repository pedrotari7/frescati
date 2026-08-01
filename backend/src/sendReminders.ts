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
			const season = { ...seasonDoc.data(), id: seasonDoc.id } as Season;
			if (season.reminderHours.length === 0) continue;

			const furthestOut = Math.max(...season.reminderHours);

			// Only games between now and the earliest reminder window can possibly
			// be due, so the query stays small however long the season is.
			const gamesSnap = await seasonDoc.ref
				.collection('games')
				.where('status', '==', 'scheduled')
				.where('kickoff', '>=', new Date(now).toISOString())
				.where('kickoff', '<=', new Date(now + furthestOut * 3_600_000).toISOString())
				.get();

			for (const gameDoc of gamesSnap.docs) {
				const game = { ...gameDoc.data(), id: gameDoc.id } as Game;
				const alreadySent = game.remindersSent ?? [];
				const hoursUntil = (new Date(game.kickoff).getTime() - now) / 3_600_000;

				// The largest window we've crossed but not yet sent. Taking the
				// largest means a missed run collapses into one reminder rather
				// than firing every skipped window at once.
				const due = season.reminderHours
					.filter(hours => hoursUntil <= hours && !alreadySent.includes(hours))
					.sort((a, b) => b - a)[0];

				if (due === undefined) continue;

				const responses = await getResponses(season.id, game.id);
				const silent = getSilentMembers(season, responses);

				if (silent.length > 0) {
					totalSent += await sendPush(
						silent,
						{
							title: 'Are you playing?',
							body: `${formatGameWhen(game.kickoff, season.slot.timezone)} — ${game.counts.playing} in so far.`,
							url: `/s/${season.id}/g/${game.id}`,
							tag: `game-${game.id}`,
						},
						'reminders'
					);
				}

				// Record every window we've now passed, not just the one sent, so
				// a skipped run doesn't fire late reminders on the next pass.
				const passed = season.reminderHours.filter(hours => hoursUntil <= hours);
				await gameDoc.ref.update({ remindersSent: Array.from(new Set([...alreadySent, ...passed])) });
			}
		}

		logger.info('Reminder sweep finished', { notificationsSent: totalSent });
	}
);
