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
import { applyMotmBonus, applyRatingChange, getRatingChanges, getSeedElo } from '../../../shared/rating';
import { getPositions, getStandings } from '../../../shared/standings';
import { selectPlayedMatches } from '../../../shared/tournament';
import { db } from './firebase';
import { getGame, getSeason } from './data';
import { clearPendingIfUnmoved, readPendingFrom, withDrainedLadderLock, withLadderLock } from './ladderLock';
import { getMotmDecision, openMotmVoting } from './motm';

/**
 * Turning a scoreboard into ratings.
 *
 * Everything a game does to the ladder happens here, and leaves behind a
 * ledger entry precise enough to undo. That last part is the whole design: a
 * correction to a confirmed result cannot be applied forward, because every
 * game after it was rated against the ratings that game produced. The only
 * correct fix is to rewind and replay — and a rewind is exact only if the state
 * before each game was written down rather than inferred afterwards.
 */

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 400;

interface GameRatings {
	standings: TournamentResult['standings'];
	changes: TournamentResult['changes'];
	before: Record<string, PlayerRating | null>;
	after: Record<string, PlayerRating>;
	positions: Record<string, number>;
	/** Who the group voted for, once its vote has been counted. */
	motm: string[];
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
 * What one game would do to the ladder, given the ratings as they stand right
 * now. `null` when there is nothing to rate.
 */
export const computeGameRatings = async (
	seasonId: string,
	gameId: string,
	season: Season,
	at: string
): Promise<GameRatings | null> => {
	const gameRef = db.doc(`seasons/${seasonId}/games/${gameId}`);

	const [teamsSnap, matchesSnap, decision] = await Promise.all([
		gameRef.collection('tournament').doc('teams').get(),
		gameRef.collection('matches').get(),
		// The counted vote, or nothing while it is still open. Read here rather
		// than tallied here on purpose: a replay must land on the same winner the
		// app announced, and re-counting is a different operation from reading
		// back what was counted.
		getMotmDecision(seasonId, gameId),
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
		lineup.settings.matchMinutes,
		season.slot.durationMinutes,
		matchesSnap.docs.map(doc => doc.data() as TournamentMatch)
	);

	// A game with no scores is not a nil-all draw for everybody, it is a game
	// that produced no information — so it moves nothing, rather than paying
	// every team a joint first.
	if (matches.length === 0) return null;

	const standings = getStandings(lineup.teams.length, matches);
	const uids = lineup.teams.flatMap(team => team.uids);
	const profiles = await getProfiles([...new Set([...season.memberUids, ...uids])]);

	// Seeded from the season's rated members, not from this game's turnout — a
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
	const motm = decision?.winners ?? [];

	// The football first, then the vote — two separate statements about the
	// evening, added together into the one movement a player sees. A game
	// confirmed while its vote is still open simply skips the second, and picks
	// it up when the count closes and asks for a replay.
	const changes = applyMotmBonus(getRatingChanges(players, positions, seedElo), motm);

	return {
		standings,
		changes,
		motm,
		before: Object.fromEntries(changes.map(change => [change.uid, profiles.get(change.uid)?.rating ?? null])),
		after: Object.fromEntries(
			changes.map(change => [change.uid, applyRatingChange(profiles.get(change.uid)?.rating, change, at)])
		),
		positions: Object.fromEntries(players.map(player => [player.uid, positions[player.team]])),
	};
};

/**
 * Write a game's ratings: every affected profile, the result, the ledger entry
 * and the marker that closes the scoreboard.
 *
 * Batched so a half-applied game can't exist. A profile updated without a
 * ledger entry would be unrewindable, which is a worse state than not having
 * applied the game at all.
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
		// Left off entirely while the vote is open, rather than written as an
		// empty list: a career screen reads this collection and nothing else, and
		// "nobody won it" and "it hadn't been counted yet" are different things
		// that would otherwise look identical.
		...(ratings.motm.length > 0 ? { motm: ratings.motm } : {}),
	};

	await commitAll([
		...Object.entries(ratings.after).map(
			([uid, rating]) =>
				(batch: WriteBatch) =>
					batch.set(db.doc(`users/${uid}`), { rating }, { merge: true })
		),
		batch => batch.set(gameRef.collection('tournament').doc('result'), result),
		batch => batch.set(db.doc(`ratingLedger/${gameId}`), entry),
		// `played` is what retires the game from the hourly sweep's query, which
		// is what lets that query drop its lower bound and stop being a race
		// against a seven-day window. Nothing in the app reads the status to
		// decide how a past game renders — `getGameLifecycle` derives that from
		// `endsAt` — so this is a marker for the sweep rather than a state
		// change anybody sees.
		batch => batch.update(gameRef, { resultFinalisedAt: finalisedAt, status: 'played' }),
	]);
};

/** Undo a game entirely — used when a replay finds every score has been cleared. */
const clearGameRatings = async (seasonId: string, gameId: string): Promise<void> => {
	const gameRef = db.doc(`seasons/${seasonId}/games/${gameId}`);

	await commitAll([
		batch => batch.delete(db.doc(`ratingLedger/${gameId}`)),
		batch => batch.delete(gameRef.collection('tournament').doc('result')),
		// Back to `scheduled` as well, or the game would be unrated and yet
		// invisible to the sweep that exists to rate it — the one state this
		// pair of fields must never be left in together.
		batch => batch.update(gameRef, { resultFinalisedAt: FieldValue.delete(), status: 'scheduled' }),
	]);
};

export type FinaliseOutcome = 'finalised' | 'nothing-to-rate' | 'already-finalised' | 'missing' | 'busy';

/**
 * Confirm a game.
 *
 * Refuses an already-confirmed game rather than applying it twice — a second
 * application would rate the same result against the ratings the first one
 * produced, which is exactly the double-counting the replay exists to avoid.
 *
 * Held under the ladder lock, for two reasons. It reads every player's current
 * rating and writes it back, so a replay rewinding underneath it would have it
 * rate the game against ratings that were never real — and it writes a *new*
 * ledger entry, which a replay already in flight never queried and so will not
 * repair. And the read of `resultFinalisedAt` and the write that sets it are
 * now one critical section, which is what stops two admins tapping Confirm at
 * the same moment from both finding it unconfirmed and both applying it.
 *
 * `busy` rather than a throw when the lock never comes free: the callable turns
 * it into something an admin can act on, and the hourly sweep simply leaves the
 * game for next time.
 */
export const finaliseGame = async (
	seasonId: string,
	gameId: string,
	finalisedBy: string | null
): Promise<FinaliseOutcome> => {
	const outcome = await withLadderLock<FinaliseOutcome>(async () => {
		const [game, season] = await Promise.all([getGame(seasonId, gameId), getSeason(seasonId)]);

		if (!game || !season) return 'missing';
		if (game.resultFinalisedAt) return 'already-finalised';

		const at = new Date().toISOString();
		const ratings = await computeGameRatings(seasonId, gameId, season, at);

		if (!ratings) return 'nothing-to-rate';

		await commitGameRatings(seasonId, gameId, ratings, game.kickoff, at, finalisedBy);

		logger.info('Finalised a game', { seasonId, gameId, players: ratings.changes.length, finalisedBy });

		return 'finalised';
	});

	// Outside the lock, and only for a confirmation that actually applied.
	//
	// Outside because it sends a notification to everybody who played, and the
	// ladder has nothing to do with that — holding a global lock open for the
	// length of a multicast would block every correction in the app behind a
	// push. Only for a real confirmation because `already-finalised` is the
	// answer a second attempt gets, and a Tuesday six weeks ago must not ask the
	// squad to vote on it again.
	//
	// The season is read again rather than carried out of the closure: this
	// happens once in a game's life, and one extra read beats a captured
	// variable that only holds a season on one of five paths.
	if (outcome === 'finalised') {
		const season = await getSeason(seasonId);

		if (season) await openMotmVoting(seasonId, gameId, season);
	}

	return outcome ?? 'busy';
};

/**
 * Ask for a replay from `fromMillis`, and run it unless somebody is already
 * running one.
 *
 * **This is what triggers should call, not `replayRatingsFrom`.** A replay is
 * background repair with nobody watching, and every caller wants the same work
 * done — so one that finds the ladder busy records how far back it needs and
 * leaves, and the holder drains that before letting go. The request is
 * honoured; just not by the invocation that made it.
 *
 * Draining is a loop rather than a single pass because a request can arrive
 * while the replay it would have made is already running, and it may need an
 * earlier kickoff than the one being covered.
 */
export const requestRatingReplay = async (fromMillis: number): Promise<number> =>
	withDrainedLadderLock(fromMillis, drainRatingReplays);

/**
 * Pick up a floor whose holder died before draining it.
 *
 * The lease frees itself after a crash, but nothing re-reads what the dead
 * holder was asked to do — so without this a correction could be recorded and
 * then quietly never applied until somebody happened to make another one. Run
 * from the hourly sweep, which is already the app's answer to "what got
 * missed".
 */
export const drainAbandonedReplays = async (): Promise<number> =>
	(await readPendingFrom()) === null ? 0 : withDrainedLadderLock(undefined, drainRatingReplays);

/** Replay whatever floor is outstanding, until none is. Assumes the lock is held. */
const drainRatingReplays = async (): Promise<number> => {
	let replayed = 0;

	for (;;) {
		const from = await readPendingFrom();
		if (from === null) return replayed;

		replayed += await replayRatingsFrom(from);

		await clearPendingIfUnmoved(from);
	}
};

/**
 * Rewind and replay every rated game from `fromMillis` onwards.
 *
 * The rewind runs latest-first, so each restore lands on the state its entry
 * was applied to and everyone ends up exactly as they were before the window.
 * The replay then runs in kickoff order, each game rated against the ratings
 * the game before it produced — which is the point, and the reason adjusting
 * only the corrected game would leave every later one wrong.
 *
 * A game that has since been deleted is rewound like any other and then
 * simply not replayed, and its ledger entry is retired on the way past. That is
 * what makes this the whole answer to a deleted game as well as a corrected
 * one: the rewind needs the entry to still be there to be exact, so nothing may
 * remove it beforehand.
 *
 * **Does no locking of its own.** Between the rewind and the end of the replay
 * the ladder is deliberately in a state nobody should read or write, so callers
 * go through `requestRatingReplay`; this is left exported for the tests, which
 * exercise the replay itself rather than who is allowed to start one.
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
				// A player who carried no rating into the game had none at all,
				// so the field goes rather than being restored to a stand-in
				// that would read as a real, settled rating.
				batch.set(db.doc(`users/${uid}`), { rating: rating ?? FieldValue.delete() }, { merge: true });
			})
		)
	);

	let replayed = 0;
	let retired = 0;

	for (const entry of entries) {
		const [game, season] = await Promise.all([getGame(entry.seasonId, entry.gameId), getSeason(entry.seasonId)]);

		// The game, or its whole season, has been deleted. The rewind above has
		// already undone everything this game did, and there is nothing left to
		// rate it from, so the entry goes too — otherwise it sits in the ledger
		// forever, still carrying its `seasonId`, and the season table keeps
		// counting a game nobody can open as an appearance and a win.
		//
		// Retired here rather than at the deletion, so there is one place that
		// knows how to unwind a rated game — and so a ledger already holding
		// orphans from before anything cleaned up after a deletion heals itself
		// the next time a replay walks over them.
		//
		// Deleted directly rather than through `clearGameRatings`, which updates
		// the game document to drop `resultFinalisedAt` and would fail the whole
		// batch against a document that no longer exists.
		if (!game || !season) {
			await db.doc(`ratingLedger/${entry.gameId}`).delete();
			retired++;

			logger.info('Retired a ledger entry whose game has gone', {
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
		// game, so who confirmed it and when are carried through untouched.
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

	logger.info('Replayed ratings', { fromMillis, entries: entries.length, replayed, retired });

	return replayed;
};
