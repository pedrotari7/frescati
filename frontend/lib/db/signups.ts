import { deleteDoc, getDoc, setDoc, waitForPendingWrites } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import type { Signup, SignupStatus } from '@shared/types';
import { getDb } from '../firebaseClient';
import { callFunction } from './call';
import { signupDoc, signupsCol } from './paths';
import { subscribeToCollection } from './subscribe';

export const subscribeToSignups = (
	seasonId: string,
	onData: (signups: Signup[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	// The uid is the document id and is not stored in the document, the rules keep the shape closed.
	subscribeToCollection(
		signupsCol(seasonId),
		docs => docs.map(d => ({ ...(d.data() as Omit<Signup, 'uid'>), uid: d.id })),
		onData,
		onError
	);

/**
 * Say yes or no to a season that is still signing up.
 *
 * The whole document, never a merge. A merge over an answer a season admin
 * wrote would keep their `answeredBy`, and the rules refuse that on a player's
 * own write. The first `answeredAt` is read back and kept, so changing your
 * mind does not move you in the order people answered.
 *
 * `answeredBy` is for a season admin answering for somebody else. A person
 * answering for themselves leaves it out, admin or not, so callers pass it only
 * when `uid` is not the signed-in user.
 */
export const setSignup = async (
	seasonId: string,
	uid: string,
	status: SignupStatus,
	answeredBy?: string
): Promise<void> => {
	const ref = signupDoc(seasonId, uid);
	const current = (await getDoc(ref)).data() as Signup | undefined;
	const now = new Date().toISOString();

	await setDoc(ref, {
		status,
		answeredAt: current?.answeredAt ?? now,
		updatedAt: now,
		...(answeredBy ? { answeredBy } : {}),
	});
};

/** Back to no answer: the third state is the absence of a document. */
export const clearSignup = (seasonId: string, uid: string): Promise<void> => deleteDoc(signupDoc(seasonId, uid));

/**
 * Turns the yeses into the squad and takes the season out of sign-up. Season admins only.
 *
 * Waits for this client's own writes to reach the server first. The function
 * reads the yeses there, while the admin screen draws them from the local cache,
 * pending ones included, so an admin who tapped Join a moment ago saw
 * themselves in the list and was refused for not having said they were in.
 */
export const confirmSeason = async (
	seasonId: string
): Promise<{ members: number; share: number; demoted: string[] }> => {
	await waitForPendingWrites(getDb());

	return callFunction('confirmSeason', { seasonId });
};
