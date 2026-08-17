import { deleteDoc, FieldPath, increment, query, setDoc, updateDoc, where } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import type { Fixture } from '@shared/tournament';
import type { RatingLedgerEntry, TournamentMatch, TournamentResult, TournamentTeams } from '@shared/types';
import { gameDoc, matchDoc, matchesCol, ratingLedgerCol, tournamentResultDoc, tournamentTeamsDoc } from './paths';
import { asData, subscribeToCollection, subscribeToDoc } from './subscribe';
import { callFunction } from './call';

export const subscribeToTeams = (
	seasonId: string,
	gameId: string,
	onChange: (teams: TournamentTeams | null) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToDoc(
		tournamentTeamsDoc(seasonId, gameId),
		snapshot => snapshot.data() as TournamentTeams,
		onChange,
		onError
	);

/**
 * Ask for a different split of the same players.
 *
 * Bumps a counter on the game rather than writing a lineup: the teams document
 * is function-only, which is what guarantees nobody can hand-pick a side. The
 * counter feeds the optimiser's seed, so this re-rolls rather than re-runs — the
 * new teams will be just as balanced, and different.
 *
 * `increment` rather than a read-then-write so two admins tapping at once
 * produce two rolls instead of silently one.
 */
export const reshuffleTeams = (seasonId: string, gameId: string) =>
	updateDoc(gameDoc(seasonId, gameId), { reshuffleCount: increment(1) });

export const subscribeToMatches = (
	seasonId: string,
	gameId: string,
	onChange: (matches: TournamentMatch[]) => void,
	onError: (error: Error) => void
): Unsubscribe => subscribeToCollection(matchesCol(seasonId, gameId), asData<TournamentMatch>(), onChange, onError);

/**
 * Record a scoreline.
 *
 * Writes the whole document rather than merging, and the id comes from the
 * fixture's place in the running order — so two people scoring the same match
 * at the same moment write the same document, and the later one wins rather
 * than the two of them creating a duplicate nobody can reconcile.
 *
 * `teamA` and `teamB` are written every time so the record survives a lineup
 * being rebuilt underneath it.
 */
export const setMatchScore = (
	seasonId: string,
	gameId: string,
	fixture: Fixture,
	scoreA: number,
	scoreB: number,
	uid: string
): Promise<void> =>
	setDoc(matchDoc(seasonId, gameId, fixture.order), {
		order: fixture.order,
		teamA: fixture.teamA,
		teamB: fixture.teamB,
		scoreA,
		scoreB,
		updatedBy: uid,
		updatedAt: new Date().toISOString(),
	});

/** Back to "not played" — the third state is the absence of a document. */
export const clearMatchScore = (seasonId: string, gameId: string, order: number) =>
	deleteDoc(matchDoc(seasonId, gameId, order));

/**
 * Every rated game in one season.
 *
 * The ledger is queried rather than each game's result document because it is
 * one read instead of two per game across a whole calendar, and it already
 * carries where each player finished.
 */
export const subscribeToSeasonLedger = (
	seasonId: string,
	onChange: (entries: RatingLedgerEntry[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToCollection(
		query(ratingLedgerCol(), where('seasonId', '==', seasonId)),
		asData<RatingLedgerEntry>(),
		onChange,
		onError
	);

/**
 * Every rated game one player appeared in, across every season.
 *
 * Filtered on their own key inside `positions` rather than by reading the whole
 * ledger and discarding most of it — a career is a handful of a group's games,
 * and this is a screen anybody can open about anybody. Firestore indexes each
 * subfield of a map on its own, so this needs no composite index and no array
 * mirrored alongside the map that already holds the answer; the trade is that
 * `positions` must stay indexed, so don't add a field exemption for it.
 *
 * `FieldPath` rather than a dotted string because a uid is not a legal field
 * path segment — the seeded ones contain a hyphen, and Google's contain digits
 * — and the string form is parsed.
 *
 * Unordered on purpose. An inequality filter forces the first sort onto the
 * field it filters, which here is a finishing place; kickoff order is put back
 * by `getPlayerGames`.
 */
export const subscribeToPlayerLedger = (
	uid: string,
	onChange: (entries: RatingLedgerEntry[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToCollection(
		query(ratingLedgerCol(), where(new FieldPath('positions', uid), '>=', 0)),
		asData<RatingLedgerEntry>(),
		onChange,
		onError
	);

export const subscribeToResult = (
	seasonId: string,
	gameId: string,
	onChange: (result: TournamentResult | null) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToDoc(
		tournamentResultDoc(seasonId, gameId),
		snapshot => snapshot.data() as TournamentResult,
		onChange,
		onError
	);

/**
 * Confirm the game and apply the ratings.
 *
 * A callable because rules cannot express this: it reads every player's current
 * rating, writes them all back and leaves a ledger entry, and applying it twice
 * would rate the same result against the ratings the first pass produced. The
 * function refuses that second application — and says so, which is why this
 * returns rather than silently succeeding.
 */
export const finaliseTournament = async (seasonId: string, gameId: string): Promise<void> => {
	await callFunction<{ seasonId: string; gameId: string }, { ok: boolean }>('finaliseTournament', {
		seasonId,
		gameId,
	});
};
