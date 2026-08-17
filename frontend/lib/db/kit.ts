import { addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { DocumentData, Unsubscribe } from 'firebase/firestore';
import type { KitItem, KitKind } from '@shared/types';
import { sortKitItems } from '@shared/kit';
import { kitCol, kitItemDoc } from './paths';
import { subscribeToCollection } from './subscribe';

const toKitItem = (id: string, data: DocumentData): KitItem => ({ ...(data as Omit<KitItem, 'id'>), id });

/**
 * Sorted on the way out rather than by the query: the order is kind-then-name,
 * which Firestore can't do without a composite index, and a season's register
 * is a handful of documents. `sortKitItems` is shared so the kit screen and the
 * game screen can't end up listing the same items in different orders.
 */
export const subscribeToKit = (
	seasonId: string,
	onChange: (items: KitItem[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToCollection(
		kitCol(seasonId),
		docs => sortKitItems(docs.map(d => toKitItem(d.id, d.data()))),
		onChange,
		onError
	);

/**
 * `updatedBy` is passed in rather than read from the auth state here, because
 * `lib/db` knows about paths and shapes and nothing about who is signed in —
 * and the security rules pin it to the caller either way.
 */
export const addKitItem = async (
	seasonId: string,
	item: { name: string; kind: KitKind; holderUid: string },
	by: string
): Promise<string> => {
	const ref = await addDoc(kitCol(seasonId), { ...item, updatedBy: by, updatedAt: new Date().toISOString() });

	return ref.id;
};

/**
 * Somebody else has it now.
 *
 * Exactly three fields, which is not a coincidence: a member's write is allowed
 * only when it touches `holderUid`, `updatedBy` and `updatedAt` and nothing
 * else, so anything more here would fail for everybody but an admin.
 */
export const transferKitItem = (seasonId: string, itemId: string, holderUid: string, by: string) =>
	updateDoc(kitItemDoc(seasonId, itemId), { holderUid, updatedBy: by, updatedAt: new Date().toISOString() });

/**
 * What the group calls it.
 *
 * Season admins only, which is the same rule that keeps the kind out of a
 * member's hands rather than a separate one: `onlyHandsItOver` allows a
 * member's write to touch `holderUid` and the signature, so a name on it is
 * refused for everybody else. Signed like a handover for the same reason — the
 * register is a shared document and every change to it has a face on it.
 */
export const renameKitItem = (seasonId: string, itemId: string, name: string, by: string) =>
	updateDoc(kitItemDoc(seasonId, itemId), { name, updatedBy: by, updatedAt: new Date().toISOString() });

export const deleteKitItem = (seasonId: string, itemId: string) => deleteDoc(kitItemDoc(seasonId, itemId));
