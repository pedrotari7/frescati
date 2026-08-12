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

export const responsesCol = (seasonId: string, gameId: string): CollectionReference =>
	collection(getDb(), 'seasons', seasonId, 'games', gameId, 'responses');

export const responseDoc = (seasonId: string, gameId: string, uid: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'games', gameId, 'responses', uid);

/** Following one game. The id is the uid; the document's presence is the answer. */
export const watcherDoc = (seasonId: string, gameId: string, uid: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'games', gameId, 'watchers', uid);

export const tournamentTeamsDoc = (seasonId: string, gameId: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'games', gameId, 'tournament', 'teams');

/** Top-level: ratings are global, so a replay walks this regardless of season. */
export const ratingLedgerCol = (): CollectionReference => collection(getDb(), 'ratingLedger');

export const tournamentResultDoc = (seasonId: string, gameId: string): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'games', gameId, 'tournament', 'result');

export const matchesCol = (seasonId: string, gameId: string): CollectionReference =>
	collection(getDb(), 'seasons', seasonId, 'games', gameId, 'matches');

/** The document id is the fixture's place in the running order. */
export const matchDoc = (seasonId: string, gameId: string, order: number): DocumentReference =>
	doc(getDb(), 'seasons', seasonId, 'games', gameId, 'matches', String(order));
