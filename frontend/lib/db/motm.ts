import { deleteDoc, setDoc } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import type { MotmVote, TournamentMotm, TournamentMotmVoters } from '@shared/types';
import { motmVoteDoc, tournamentMotmDoc, tournamentMotmVotersDoc } from './paths';
import { subscribeToDoc } from './subscribe';

/**
 * Voting for man of the match.
 *
 * Three documents, and which one a screen can read is the whole shape of it:
 * your own vote, which nobody else may read; the counted result, which everybody
 * may, once it exists; and between them the turnout, which is who has answered
 * and pointedly not what they answered.
 *
 * That middle one is exactly as public as it can afford to be. A running total
 * while the vote is open is what turns an early lead into a bandwagon, so the
 * picks stay sealed until the sweep publishes them — but a list of names with no
 * picks attached leads nowhere, and answers the question the group actually has
 * on a Thursday, which is who still needs chasing. It is function-written for
 * the ordinary reason: no client can read anybody else's vote, so no client can
 * work it out.
 *
 * Casting a vote is a write, changing your mind overwrites, and abstaining is
 * the absence of the document — the same third state a response uses.
 */

/** Shared so an absent turnout document hands back the same array every time. */
const NO_VOTERS: string[] = [];

export const subscribeToMyMotmVote = (
	seasonId: string,
	gameId: string,
	uid: string,
	onChange: (vote: MotmVote | null) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToDoc(motmVoteDoc(seasonId, gameId, uid), snapshot => snapshot.data() as MotmVote, onChange, onError);

export const subscribeToMotm = (
	seasonId: string,
	gameId: string,
	onChange: (motm: TournamentMotm | null) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToDoc(
		tournamentMotmDoc(seasonId, gameId),
		snapshot => snapshot.data() as TournamentMotm,
		onChange,
		onError
	);

/**
 * Who has voted so far. An absent document is nobody yet, and it goes for good
 * when the vote is counted — from then on the turnout is in the totals.
 */
export const subscribeToMotmVoters = (
	seasonId: string,
	gameId: string,
	onChange: (uids: string[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToDoc(
		tournamentMotmVotersDoc(seasonId, gameId),
		snapshot => (snapshot.data() as TournamentMotmVoters).uids,
		uids => onChange(uids ?? NO_VOTERS),
		onError
	);

export const setMotmVote = (seasonId: string, gameId: string, uid: string, votedFor: string): Promise<void> =>
	setDoc(motmVoteDoc(seasonId, gameId, uid), { uid, votedFor, votedAt: new Date().toISOString() });

/** Back to not having voted — the third state is the absence of a document. */
export const clearMotmVote = (seasonId: string, gameId: string, uid: string): Promise<void> =>
	deleteDoc(motmVoteDoc(seasonId, gameId, uid));
