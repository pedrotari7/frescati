import { collection, doc } from 'firebase/firestore';
import type { CollectionReference, DocumentReference } from 'firebase/firestore';
import { getDb } from '../firebaseClient';

/** One place that knows the shape of the database. Nothing else builds paths. */

export const usersCol = (): CollectionReference => collection(getDb(), 'users');

export const userDoc = (uid: string): DocumentReference => doc(getDb(), 'users', uid);

export const pushTokensCol = (uid: string): CollectionReference => collection(getDb(), 'users', uid, 'pushTokens');

export const seasonsCol = (): CollectionReference => collection(getDb(), 'seasons');

export const seasonDoc = (seasonId: string): DocumentReference => doc(getDb(), 'seasons', seasonId);

export const gamesCol = (seasonId: string): CollectionReference => collection(getDb(), 'seasons', seasonId, 'games');

export const gameDoc = (seasonId: string, gameId: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'games', gameId);

/** What the group owns and who has it. One document per item; the id is generated. */
export const kitCol = (seasonId: string): CollectionReference => collection(getDb(), 'seasons', seasonId, 'kit');

export const kitItemDoc = (seasonId: string, itemId: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'kit', itemId);

/**
 * What one player owes. The id is derived from what the charge is for,
 * `entry_{uid}` or `game_{gameId}_{uid}`, so raising the same charge twice
 * collides instead of duplicating. `shared/finances.ts` builds it.
 */
export const duesCol = (seasonId: string): CollectionReference => collection(getDb(), 'seasons', seasonId, 'dues');

export const dueDoc = (seasonId: string, dueId: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'dues', dueId);

/**
 * Who still owes this season money. The id is the uid, and the document's
 * presence is the answer, the same arrangement as `watchers`. Written only by
 * `onDueWrite` and `remindDebtors`; a client that tries is refused.
 */
export const debtorsCol = (seasonId: string): CollectionReference =>
	collection(getDb(), 'seasons', seasonId, 'debtors');

/**
 * The season's paperwork, one document per receipt. The id is generated, and it
 * is also the name of the file in Cloud Storage: `receiptObjectPath` in
 * `shared/receipts.ts` is the only thing that spells that path.
 */
export const receiptsCol = (seasonId: string): CollectionReference =>
	collection(getDb(), 'seasons', seasonId, 'receipts');

export const receiptDoc = (seasonId: string, receiptId: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'receipts', receiptId);

/** Money out of one of the two pots. One document per purchase; the id is generated. */
export const expensesCol = (seasonId: string): CollectionReference =>
	collection(getDb(), 'seasons', seasonId, 'expenses');

export const expenseDoc = (seasonId: string, expenseId: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'expenses', expenseId);

export const responsesCol = (seasonId: string, gameId: string): CollectionReference =>
	collection(getDb(), 'seasons', seasonId, 'games', gameId, 'responses');

export const responseDoc = (seasonId: string, gameId: string, uid: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'games', gameId, 'responses', uid);

/** Following one game. The id is the uid; the document's presence is the answer. */
export const watcherDoc = (seasonId: string, gameId: string, uid: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'games', gameId, 'watchers', uid);

export const tournamentTeamsDoc = (seasonId: string, gameId: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'games', gameId, 'tournament', 'teams');

/**
 * One person's man-of-the-match vote. The id is the voter, and the document is
 * readable by nobody else, the totals arrive on `tournamentMotmDoc` once the
 * vote has been counted.
 */
export const motmVoteDoc = (seasonId: string, gameId: string, uid: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'games', gameId, 'motmVotes', uid);

/**
 * Who has voted so far, uids only, written by the trigger behind the votes.
 * Turnout is public while the vote runs; what anybody voted for is not.
 */
export const tournamentMotmVotersDoc = (seasonId: string, gameId: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'games', gameId, 'tournament', 'motmVoters');

/** The counted vote. Its existence is what says the counting has happened. */
export const tournamentMotmDoc = (seasonId: string, gameId: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'games', gameId, 'tournament', 'motm');

/** Top-level: ratings are global, so a replay walks this regardless of season. */
export const ratingLedgerCol = (): CollectionReference => collection(getDb(), 'ratingLedger');

export const tournamentResultDoc = (seasonId: string, gameId: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'games', gameId, 'tournament', 'result');

export const matchesCol = (seasonId: string, gameId: string): CollectionReference =>
	collection(getDb(), 'seasons', seasonId, 'games', gameId, 'matches');

/** The document id is the fixture's place in the running order. */
export const matchDoc = (seasonId: string, gameId: string, order: number): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'games', gameId, 'matches', String(order));
