import { logger } from 'firebase-functions';
import { db } from './firebase';
import { sendRecapReady } from './push';
import { readSeasonEnd } from './seasonEnd';

export type RecapAnnouncement = 'announced' | 'already' | 'not-finished' | 'missing';

/**
 * Stamp `recapReadyAt` on a season whose last game has just been settled, and
 * tell everybody who played in it.
 *
 * Called from the two places that can supply the last missing piece: a game
 * being confirmed, which writes its ledger entry, and a game being called off,
 * which takes an unscored one off the calendar. Any other call finds the
 * season unfinished or already stamped and does nothing, which is what makes
 * it safe to call on every confirmation rather than working out which one is
 * the last.
 *
 * The games and the ledger are read outside the transaction, because only the
 * stamp needs one. Two confirmations racing at the end of a season (the hourly
 * sweep and an admin) both see a finished season, and the transaction lets
 * exactly one of them write the stamp. Only that one sends. A later rating
 * replay rewrites ledger entries but never calls this, and would find the
 * stamp if it did.
 */
export const announceRecapIfReady = async (
	seasonId: string,
	nowIso = new Date().toISOString()
): Promise<RecapAnnouncement> => {
	const seasonRef = db.doc(`seasons/${seasonId}`);
	const { finished, players } = await readSeasonEnd(db, seasonRef, nowIso);

	if (!finished) return (await seasonRef.get()).exists ? 'not-finished' : 'missing';

	const outcome = await db.runTransaction(async transaction => {
		const season = await transaction.get(seasonRef);

		if (!season.exists) return { result: 'missing' as const };
		if (season.get('recapReadyAt')) return { result: 'already' as const };

		transaction.update(seasonRef, { recapReadyAt: nowIso });
		return { result: 'announced' as const, seasonName: season.get('name') as string };
	});

	if (outcome.result !== 'announced') return outcome.result;

	const sent = await sendRecapReady(players, { seasonId, seasonName: outcome.seasonName });

	logger.info('Announced a season recap', { seasonId, players: players.length, ...sent });

	return 'announced';
};
