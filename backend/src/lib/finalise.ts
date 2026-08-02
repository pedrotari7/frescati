import { FieldValue } from 'firebase-admin/firestore';
import type { WriteBatch } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type {
	AppUser,
	PlayerRating,
	RatingLedgerEntry,
	Season,
	TournamentMatch,
	TournamentResult,
	TournamentTeams,
} from '../../../shared/types';
import type { RatingInput } from '../../../shared/rating';
import { applyRatingChange, getRatingChanges, getSeedElo } from '../../../shared/rating';
import { getPositions, getStandings } from '../../../shared/standings';
import { selectPlayedMatches } from '../../../shared/tournament';
import { db } from './firebase';
import { getGame, getSeason } from './data';

/**
 * Turning a scoreboard into ratings.
 *
 * Everything a night does to the ladder happens here, and leaves behind a
 * ledger entry precise enough to undo. That last part is the whole design: a
 * correction to a confirmed result cannot be applied forward, because every
 * game after it was rated against the ratings that game produced. The only
 * correct fix is to rewind and replay — and a rewind is exact only if the state
 * before each night was written down rather than inferred afterwards.
 */

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 400;

interface GameRatings {
	standings: TournamentResult['standings'];
	changes: TournamentResult['changes'];
	before: Record<string, PlayerRating | null>;
	after: Record<string, PlayerRating>;
	positions: Record<string, number>;
}

const getProfiles = async (uids: string[]): Promise<Map<string, AppUser>> => {
	if (uids.length === 0) return new Map();

	const snapshots = await db.getAll(...uids.map(uid => db.doc(`users/${uid}`)));

	return new Map(snapshots.filter(snap => snap.exists).map(snap => [snap.id, snap.data() as AppUser]));
};

/** Run a pile of writes as however many batches it takes. */
const commitAll = async (writes: ((batch: WriteBatch) => void)[]): Promise<void> => {
	for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
		const batch = db.batch();
		for (const write of writes.slice(start, start + BATCH_LIMIT)) write(batch);
		await batch.commit();
	}
};

/**
 * What one night would do to the ladder, given the ratings as they stand right
 * now. `null` when there is nothing to rate.
 */
export const computeGameRatings = async (
	seasonId: string,
	gameId: string,
	season: Season,
	at: string
): Promise<GameRatings | null> => {
	const gameRef = db.doc(`seasons/${seasonId}/games/${gameId}`);

	const [teamsSnap, matchesSnap] = await Promise.all([
		gameRef.collection('tournament').doc('teams').get(),
		gameRef.collection('matches').get(),
	]);

	if (!teamsSnap.exists) return null;

	const lineup = teamsSnap.data() as TournamentTeams;

	// Filtered rather than taken as read: anybody holding a response on the game
	// may write here, so the collection is not by itself a description of what
	// was played. Everything below — the table, the positions, every rating
	// change and the ledger entry that has to be able to undo them — is built
	// from whatever survives this.
	const matches = selectPlayedMatches(
		lineup.teams.length,
		matchesSnap.docs.map(doc => doc.data() as TournamentMatch)
	);

	// A night with no scores is not a nil-all draw for everybody, it is a night
	// that produced no information — so it moves nothing, rather than paying
	// every team a joint first.
	if (matches.length === 0) return null;

	const standings = getStandings(lineup.teams.length, matches);
	const uids = lineup.teams.flatMap(team => team.uids);
	const profiles = await getProfiles([...new Set([...season.memberUids, ...uids])]);

	// Seeded from the season's rated members, not from tonight's turnout — a
	// newcomer's starting point shouldn't depend on who else happened to show.
	const seedElo = getSeedElo(
		season.memberUids
			.map(uid => profiles.get(uid)?.rating?.elo)
			.filter((elo): elo is number => typeof elo === 'number')
	);

	const players: RatingInput[] = lineup.teams.flatMap(team =>
		team.uids.map(uid => ({ uid, rating: profiles.get(uid)?.rating, team: team.index }))
	);

	const positions = getPositions(standings);
	const changes = getRatingChanges(players, positions, seedElo);

	return {
		standings,
		changes,
		before: Object.fromEntries(changes.map(change => [change.uid, profiles.get(change.uid)?.rating ?? null])),
		after: Object.fromEntries(
			changes.map(change => [change.uid, applyRatingChange(profiles.get(change.uid)?.rating, change, at)])
		),
		positions: Object.fromEntries(players.map(player => [player.uid, positions[player.team]])),
	};
};

/**
 * Write a night's ratings: every affected profile, the result, the ledger entry
 * and the marker that closes the scoreboard.
 *
 * Batched so a half-applied night can't exist. A profile updated without a
 * ledger entry would be unrewindable, which is a worse state than not having
 * applied the night at all.
 */
const commitGameRatings = async (
	seasonId: string,
	gameId: string,
	ratings: GameRatings,
	kickoff: string,
	finalisedAt: string,
	finalisedBy: string | null
): Promise<void> => {
	const gameRef = db.doc(`seasons/${seasonId}/games/${gameId}`);

	const result: TournamentResult = {
		standings: ratings.standings,
		changes: ratings.changes,
		finalisedAt,
		finalisedBy,
	};

	const entry: RatingLedgerEntry = {
		seasonId,
		gameId,
		kickoff,
		kickoffMillis: Date.parse(kickoff),
		finalisedAt,
		before: ratings.before,
		after: ratings.after,
		positions: ratings.positions,
	};

	await commitAll([
		...Object.entries(ratings.after).map(
			([uid, rating]) =>
				(batch: WriteBatch) =>
					batch.set(db.doc(`users/${uid}`), { rating }, { merge: true })
		),
		batch => batch.set(gameRef.collection('tournament').doc('result'), result),
		batch => batch.set(db.doc(`ratingLedger/${gameId}`), entry),
		batch => batch.update(gameRef, { resultFinalisedAt: finalisedAt }),
	]);
};

/** Undo a night entirely — used when a replay finds every score has been cleared. */
const clearGameRatings = async (seasonId: string, gameId: string): Promise<void> => {
	const gameRef = db.doc(`seasons/${seasonId}/games/${gameId}`);

	await commitAll([
		batch => batch.delete(db.doc(`ratingLedger/${gameId}`)),
		batch => batch.delete(gameRef.collection('tournament').doc('result')),
		batch => batch.update(gameRef, { resultFinalisedAt: FieldValue.delete() }),
	]);
};

/**
 * Confirm a night.
 *
 * Refuses an already-confirmed game rather than applying it twice — a second
 * application would rate the same result against the ratings the first one
 * produced, which is exactly the double-counting the replay exists to avoid.
 */
export const finaliseGame = async (
	seasonId: string,
	gameId: string,
	finalisedBy: string | null
): Promise<'finalised' | 'nothing-to-rate' | 'already-finalised' | 'missing'> => {
	const [game, season] = await Promise.all([getGame(seasonId, gameId), getSeason(seasonId)]);

	if (!game || !season) return 'missing';
	if (game.resultFinalisedAt) return 'already-finalised';

	const at = new Date().toISOString();
	const ratings = await computeGameRatings(seasonId, gameId, season, at);

	if (!ratings) return 'nothing-to-rate';

	await commitGameRatings(seasonId, gameId, ratings, game.kickoff, at, finalisedBy);

	logger.info('Finalised a night', { seasonId, gameId, players: ratings.changes.length, finalisedBy });

	return 'finalised';
};

/**
 * Rewind and replay every rated game from `fromMillis` onwards.
 *
 * The rewind runs latest-first, so each restore lands on the state its entry
 * was applied to and everyone ends up exactly as they were before the window.
 * The replay then runs in kickoff order, each night rated against the ratings
 * the night before it produced — which is the point, and the reason adjusting
 * only the corrected game would leave every later one wrong.
 */
export const replayRatingsFrom = async (fromMillis: number): Promise<number> => {
	const entriesSnap = await db
		.collection('ratingLedger')
		.where('kickoffMillis', '>=', fromMillis)
		.orderBy('kickoffMillis', 'asc')
		.get();

	const entries = entriesSnap.docs.map(doc => doc.data() as RatingLedgerEntry);

	if (entries.length === 0) return 0;

	await commitAll(
		[...entries].reverse().flatMap(entry =>
			Object.entries(entry.before).map(([uid, rating]) => (batch: WriteBatch) => {
				// A player who carried no rating into the night had none at all,
				// so the field goes rather than being restored to a stand-in
				// that would read as a real, settled rating.
				batch.set(db.doc(`users/${uid}`), { rating: rating ?? FieldValue.delete() }, { merge: true });
			})
		)
	);

	let replayed = 0;

	for (const entry of entries) {
		const [game, season] = await Promise.all([getGame(entry.seasonId, entry.gameId), getSeason(entry.seasonId)]);

		if (!game || !season) {
			logger.warn('Skipped a ledger entry whose game has gone', {
				seasonId: entry.seasonId,
				gameId: entry.gameId,
			});
			continue;
		}

		const ratings = await computeGameRatings(entry.seasonId, entry.gameId, season, entry.finalisedAt);

		if (!ratings) {
			await clearGameRatings(entry.seasonId, entry.gameId);
			continue;
		}

		// The original confirmation stands — a correction doesn't re-confirm the
		// night, so who confirmed it and when are carried through untouched.
		const previous = await db.doc(`seasons/${entry.seasonId}/games/${entry.gameId}/tournament/result`).get();

		await commitGameRatings(
			entry.seasonId,
			entry.gameId,
			ratings,
			game.kickoff,
			entry.finalisedAt,
			(previous.data() as TournamentResult | undefined)?.finalisedBy ?? null
		);
		replayed++;
	}

	logger.info('Replayed ratings', { fromMillis, entries: entries.length, replayed });

	return replayed;
};
