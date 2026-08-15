import { deleteDoc, onSnapshot, setDoc } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import type { MotmVote, TournamentMotm } from '@shared/types';
import { motmVoteDoc, tournamentMotmDoc } from './paths';

/**
 * Voting for man of the match.
 *
 * Two documents, and which one a screen can read is the whole shape of it: your
 * own vote, which nobody else may read, and the counted result, which everybody
 * may. There is deliberately no third thing in between — no running total, no
 * "four people have voted" — because a count visible while the vote is open is
 * what turns an early lead into a bandwagon, and a rule that publishes it to
 * one screen publishes it to every client.
 *
 * Casting a vote is a write, changing your mind overwrites, and abstaining is
 * the absence of the document — the same third state a response uses.
 */

export const subscribeToMyMotmVote = (
	seasonId: string,
	gameId: string,
	uid: string,
	onChange: (vote: MotmVote | null) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	onSnapshot(
		motmVoteDoc(seasonId, gameId, uid),
		snapshot => onChange(snapshot.exists() ? (snapshot.data() as MotmVote) : null),
		onError
	);

export const subscribeToMotm = (
	seasonId: string,
	gameId: string,
	onChange: (motm: TournamentMotm | null) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	onSnapshot(
		tournamentMotmDoc(seasonId, gameId),
		snapshot => onChange(snapshot.exists() ? (snapshot.data() as TournamentMotm) : null),
		onError
	);

export const setMotmVote = (seasonId: string, gameId: string, uid: string, votedFor: string): Promise<void> =>
	setDoc(motmVoteDoc(seasonId, gameId, uid), { uid, votedFor, votedAt: new Date().toISOString() });

/** Back to not having voted — the third state is the absence of a document. */
export const clearMotmVote = (seasonId: string, gameId: string, uid: string): Promise<void> =>
	deleteDoc(motmVoteDoc(seasonId, gameId, uid));
