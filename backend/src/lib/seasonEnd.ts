import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import type { Game, RatingLedgerEntry } from '../../../shared/types';
import { isSeasonFinished } from '../../../shared/recap';

/**
 * Whether a season is over, and who played in it, read the way both the
 * function and the backfill have to agree on.
 *
 * Takes the Firestore handle rather than importing one, so `backfill-recap-ready`
 * can use it without a module that opens an app at load time.
 */
export const readSeasonEnd = async (
	db: Firestore,
	seasonRef: DocumentReference,
	nowIso: string
): Promise<{ finished: boolean; players: string[] }> => {
	const [games, ledger] = await Promise.all([
		seasonRef.collection('games').get(),
		db.collection('ratingLedger').where('seasonId', '==', seasonRef.id).get(),
	]);
	const entries = ledger.docs.map(doc => doc.data() as RatingLedgerEntry);

	return {
		finished: isSeasonFinished(
			games.docs.map(doc => ({ ...(doc.data() as Game), id: doc.id })),
			entries,
			nowIso
		),
		players: [...new Set(entries.flatMap(entry => Object.keys(entry.positions)))],
	};
};
