import { deleteDoc, doc, orderBy, query, setDoc } from 'firebase/firestore';
import type { DocumentData, Unsubscribe } from 'firebase/firestore';
import type { FirebaseStorage, StorageReference } from 'firebase/storage';
import { connectStorageEmulator, deleteObject, getBlob, getStorage, ref, uploadBytes } from 'firebase/storage';
import type { Receipt } from '@shared/types';
import { receiptObjectPath } from '@shared/receipts';
import { getFirebaseApp } from '../firebaseClient';
import { receiptDoc, receiptsCol } from './paths';
import { subscribeToCollection } from './subscribe';

/**
 * The season's receipts: a Firestore document to list them by and a Cloud
 * Storage object holding the bytes.
 *
 * The pairing is what makes this a normal screen. Listing receipts is an
 * `onSnapshot` like every other list in the app, so a receipt an admin uploads
 * appears on everybody's screen the same moment a kit handover does, and none
 * of that costs a byte of the files themselves. Only opening one touches
 * Storage.
 */

const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === '1';

let storageInstance: FirebaseStorage | undefined;

/**
 * Cloud Storage, reached through `getFirebaseApp()` so App Check starts before
 * the first upload, exactly as it does for Firestore.
 *
 * Here rather than beside the other accessors in `firebaseClient.ts` for one
 * reason: everything in the app imports that module, so a static import of
 * `firebase/storage` there would put the whole Storage SDK in the chunk every
 * screen loads, to be used by one section of one screen. `lib/push.ts` reaches
 * for Cloud Messaging the same way and for the same reason.
 */
const storage = (): FirebaseStorage => {
	if (!storageInstance) {
		storageInstance = getStorage(getFirebaseApp());
		if (useEmulators) connectStorageEmulator(storageInstance, '127.0.0.1', 9199);
	}

	return storageInstance;
};

/** The one object a receipt owns, named after the document that indexes it. */
const objectRef = (seasonId: string, receiptId: string): StorageReference =>
	ref(storage(), receiptObjectPath(seasonId, receiptId));

const toReceipt = (id: string, data: DocumentData): Receipt => ({ ...(data as Omit<Receipt, 'id'>), id });

/**
 * Every receipt in the season, newest first.
 *
 * Squad only: the rule is `isSeasonSquad`, which standing alone denies a list to
 * anybody else, so an extra asking for this gets a permission error rather than
 * an empty array. There is no narrowed query to fall back to, unlike dues,
 * because a receipt belongs to the season rather than to a person.
 */
export const subscribeToReceipts = (
	seasonId: string,
	onChange: (receipts: Receipt[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToCollection(
		query(receiptsCol(seasonId), orderBy('uploadedAt', 'desc')),
		docs => docs.map(receipt => toReceipt(receipt.id, receipt.data())),
		onChange,
		onError
	);

/**
 * Put a receipt in the season.
 *
 * The id is minted first, locally, because the object is named after it: one
 * `doc()` on the collection gives a path to upload to and a document to write
 * afterwards, and nothing has to guess what the other half called it.
 *
 * The bytes go first and the document second, so a row in the list always has
 * a file behind it. A failure between the two leaves an object nobody can see,
 * which costs a fraction of a cent and is swept up when the season is deleted;
 * the other order leaves a receipt on everybody's screen that downloads
 * nothing.
 */
export const uploadReceipt = async (seasonId: string, file: File, name: string, by: string): Promise<string> => {
	const receipt = doc(receiptsCol(seasonId));

	await uploadBytes(objectRef(seasonId, receipt.id), file, { contentType: file.type });

	await setDoc(receipt, {
		name,
		contentType: file.type,
		size: file.size,
		uploadedBy: by,
		uploadedAt: new Date().toISOString(),
	});

	return receipt.id;
};

/**
 * The file itself, fetched with the reader's own credentials.
 *
 * `getBlob` rather than `getDownloadURL`, and that is the whole access story
 * for this feature. A download URL carries a token that works for anybody
 * holding it, signed in or not, for as long as the object exists, so minting
 * one would quietly undo the rule that says only the squad may read a receipt.
 * This is an authorised fetch: `storage.rules` reads the season document and
 * decides, on every single request.
 *
 * The price is that the bucket needs a CORS entry for the app's origin, which
 * `storage.cors.json` holds. See `docs/finances.md`.
 */
export const fetchReceipt = (seasonId: string, receiptId: string): Promise<Blob> =>
	getBlob(objectRef(seasonId, receiptId));

/**
 * Take one back off the season.
 *
 * The object goes first, and a missing one is not an error: that is what makes
 * a second press finish a delete whose first half already landed. The document
 * last, because while it is there the list still offers a receipt to download,
 * and a few milliseconds of that beats a permanent row with nothing behind it.
 */
export const deleteReceipt = async (seasonId: string, receiptId: string): Promise<void> => {
	try {
		await deleteObject(objectRef(seasonId, receiptId));
	} catch (error) {
		if ((error as { code?: string }).code !== 'storage/object-not-found') throw error;
	}

	await deleteDoc(receiptDoc(seasonId, receiptId));
};
