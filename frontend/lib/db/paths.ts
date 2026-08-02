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
