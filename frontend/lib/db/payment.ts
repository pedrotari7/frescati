import { deleteDoc, setDoc } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import type { PayeeOption } from '@shared/types';
import { callFunction } from './call';
import { paymentDoc } from './paths';
import { subscribeToDoc } from './subscribe';

/** The number an admin has saved, live, or `null` when there is none. */
export const subscribeToPayment = (
	uid: string,
	onData: (swish: string | null) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToDoc(
		paymentDoc(uid),
		snapshot => (snapshot.data().swish as string | undefined) ?? null,
		value => onData(value),
		onError
	);

/**
 * Saves the number, trimmed. An empty one is refused rather than written: the
 * rules want one to twenty characters, and clearing is `clearPayment`, which
 * removes the document so "no number" is the absence of one.
 */
export const savePayment = (uid: string, swish: string): Promise<void> => {
	const trimmed = swish.trim();
	if (!trimmed) return Promise.reject(new Error('A Swish number cannot be empty. Clear it instead.'));

	return setDoc(paymentDoc(uid), { swish: trimmed, updatedAt: new Date().toISOString() });
};

export const clearPayment = (uid: string): Promise<void> => deleteDoc(paymentDoc(uid));

/**
 * The admins a season could name as a payee, sorted by name. Never their
 * numbers: a callable, because who has saved one is private data, see
 * `backend/src/listPayees.ts`.
 */
export const listPayees = async (): Promise<PayeeOption[]> =>
	(await callFunction<void, { payees: PayeeOption[] }>('listPayees', undefined)).payees;
