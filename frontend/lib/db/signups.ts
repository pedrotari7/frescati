import { deleteDoc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import type { Signup, SignupStatus } from '@shared/types';
import { callFunction } from './call';
import { signupDoc, signupsCol } from './paths';

/**
 * An answer as this client sees it. `pending` is an answer written here that
 * the server has not acknowledged yet. It is never stored.
 */
export type SeenSignup = Signup & { pending?: true };

/**
 * Everybody's answer, with the ones still on their way to the server marked.
 *
 * `confirmSeason` reads the yeses on the server, and this listener shows the
 * local cache, pending writes included. An admin who had just tapped Join saw
 * themselves joining, confirmed, and was refused for not having said they
 * were in. With metadata changes the listener fires again when the write lands,
 * so the admin screen can hold Confirm until then.
 */
export const subscribeToSignups = (
	seasonId: string,
	onData: (signups: SeenSignup[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	onSnapshot(
		signupsCol(seasonId),
		{ includeMetadataChanges: true },
		snapshot =>
			onData(
				// The uid is the document id and is not stored in the document, the rules keep the shape closed.
				snapshot.docs.map(d => ({
					...(d.data() as Omit<Signup, 'uid'>),
					uid: d.id,
					...(d.metadata.hasPendingWrites ? { pending: true as const } : {}),
				}))
			),
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

/** Turns the yeses into the squad and takes the season out of sign-up. Season admins only. */
export const confirmSeason = (seasonId: string): Promise<{ members: number; share: number; demoted: string[] }> =>
	callFunction('confirmSeason', { seasonId });
