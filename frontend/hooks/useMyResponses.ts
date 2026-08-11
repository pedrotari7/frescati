'use client';

import { useMemo } from 'react';
import { collectionGroup, onSnapshot, query, where } from 'firebase/firestore';
import type { GameResponse } from '@shared/types';
import { getDb } from '../lib/firebaseClient';
import { useAuth } from '../lib/auth';
import { useFirestoreSubscription } from './useFirestoreSubscription';

/** gameId -> the signed-in user's response to it. */
export type MyResponses = Record<string, GameResponse>;

const NONE: MyResponses = {};

/**
 * Every answer the signed-in user has given, keyed by game id.
 *
 * One collection-group listener rather than a document listener per game — the
 * games list needs to show "you haven't answered this one" on every row, and
 * that would otherwise be a listener per row.
 */
export const useMyResponses = () => {
	const { user } = useAuth();
	const uid = user?.uid ?? null;

	const { data, loading, error } = useFirestoreSubscription<MyResponses>(
		NONE,
		uid
			? (onChange, onError) =>
					onSnapshot(
						query(collectionGroup(getDb(), 'responses'), where('uid', '==', uid)),
						snapshot => {
							const byGame: MyResponses = {};

							for (const responseDoc of snapshot.docs) {
								// .../games/{gameId}/responses/{uid}
								const gameId = responseDoc.ref.parent.parent?.id;
								if (gameId) byGame[gameId] = responseDoc.data() as GameResponse;
							}

							onChange(byGame);
						},
						onError
					)
			: null,
		[uid],
		'myResponses'
	);

	return useMemo(() => ({ myResponses: data, loading, error }), [data, loading, error]);
};
