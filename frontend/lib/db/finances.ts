import {
	addDoc,
	deleteDoc,
	deleteField,
	getDocs,
	orderBy,
	query,
	updateDoc,
	where,
	writeBatch,
} from 'firebase/firestore';
import type { DocumentData, Unsubscribe } from 'firebase/firestore';
import type { Due, DueStatus, Expense, Game, GameResponse } from '@shared/types';
import type { PlannedDue } from '@shared/finances';
import { hasBeenPlayed } from '@shared/game';
import { getDb } from '../firebaseClient';
import { dueDoc, duesCol, expenseDoc, expensesCol, responsesCol } from './paths';
import { asData, subscribeToCollection } from './subscribe';

// `Due` is a union, so `Omit<Due, 'id'>` would collapse to the keys both arms
// share and quietly drop the receipt. The cast is the whole document either way.
const toDue = (id: string, data: DocumentData): Due => ({ ...data, id }) as Due;

const toExpense = (id: string, data: DocumentData): Expense => ({ ...(data as Omit<Expense, 'id'>), id });

/**
 * Every charge in the season, newest first.
 *
 * Only the squad can run this: the rule for an unconstrained list requires
 * membership, so an extra calling it gets a permission error rather than an
 * empty array. `subscribeToMyDues` is the query for everybody else.
 */
export const subscribeToDues = (
	seasonId: string,
	onChange: (dues: Due[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToCollection(
		query(duesCol(seasonId), orderBy('createdAt', 'desc')),
		docs => docs.map(d => toDue(d.id, d.data())),
		onChange,
		onError
	);

/**
 * One player's charges.
 *
 * The `where` is not an optimisation, it is what makes the read legal. The rule
 * is `resource.data.uid == request.auth.uid`, and Firestore refuses a list it
 * cannot prove that of for every document the query could match, so the
 * constraint has to be on the query. Same arrangement as `watchers`.
 *
 * No `orderBy` beside it, deliberately. An equality filter plus an ordering on
 * some other field is exactly the shape that needs a composite index, and
 * `duesFor` already sorts newest first for both this screen and the admin's.
 */
export const subscribeToMyDues = (
	seasonId: string,
	uid: string,
	onChange: (dues: Due[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToCollection(
		query(duesCol(seasonId), where('uid', '==', uid)),
		docs => docs.map(d => toDue(d.id, d.data())),
		onChange,
		onError
	);

export const subscribeToExpenses = (
	seasonId: string,
	onChange: (expenses: Expense[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToCollection(
		query(expensesCol(seasonId), orderBy('date', 'desc')),
		docs => docs.map(d => toExpense(d.id, d.data())),
		onChange,
		onError
	);

/**
 * Raise the charges that ought to exist and don't.
 *
 * `set` on the derived id rather than `add`, which is the whole idempotence
 * story: two admins tapping at once write the same document instead of two, and
 * a sweep running again over a charge somebody has already paid is refused by
 * the rules rather than resetting it to owing. A batch is all-or-nothing, so an
 * overlap fails the lot and the next sweep, computed from fresh data, has
 * nothing left to collide with.
 */
export const raiseDues = async (seasonId: string, planned: PlannedDue[]): Promise<number> => {
	if (planned.length === 0) return 0;

	const batch = writeBatch(getDb());
	const createdAt = new Date().toISOString();

	for (const due of planned) {
		batch.set(dueDoc(seasonId, due.id), {
			uid: due.uid,
			kind: due.kind,
			amount: due.amount,
			...(due.gameId ? { gameId: due.gameId } : {}),
			status: 'owing',
			createdAt,
		});
	}

	await batch.commit();

	return planned.length;
};

/**
 * A charge an admin raised by hand, for the case the sweep deliberately misses:
 * a no-show they have decided should pay anyway. Generated id, because there is
 * no fact about the season that would derive one, and `note` is where the admin
 * says why.
 */
export const addDue = async (
	seasonId: string,
	due: { uid: string; amount: number; note?: string }
): Promise<string> => {
	const ref = await addDoc(duesCol(seasonId), {
		uid: due.uid,
		kind: 'game',
		amount: due.amount,
		...(due.note ? { note: due.note } : {}),
		status: 'owing',
		createdAt: new Date().toISOString(),
	});

	return ref.id;
};

/**
 * Report a payment, or take one back.
 *
 * The receipt is removed rather than blanked on the way back to owing, because
 * the rules enforce the `Due` union from the other side: an owing charge still
 * carrying `settledAt` is refused. `by` is passed in rather than read from the
 * auth state, the same as every other signature in `lib/db`.
 */
export const setDueStatus = (seasonId: string, dueId: string, status: DueStatus, by: string) =>
	updateDoc(
		dueDoc(seasonId, dueId),
		status === 'owing'
			? { status, settledAt: deleteField(), settledBy: deleteField() }
			: { status, settledAt: new Date().toISOString(), settledBy: by }
	);

export const deleteDue = (seasonId: string, dueId: string) => deleteDoc(dueDoc(seasonId, dueId));

export const addExpense = async (
	seasonId: string,
	expense: { description: string; amount: number; date: string },
	by: string
): Promise<string> => {
	const ref = await addDoc(expensesCol(seasonId), {
		...expense,
		createdBy: by,
		createdAt: new Date().toISOString(),
	});

	return ref.id;
};

export const deleteExpense = (seasonId: string, expenseId: string) => deleteDoc(expenseDoc(seasonId, expenseId));

/**
 * Who played, game by game, read once.
 *
 * The only one-shot read in the app; everything else is `onSnapshot`. It is a
 * query per played game, roughly thirty over a full season, far too much to
 * hold open on a screen and cheap enough behind a button an admin presses when
 * they sit down to do the books. Cancelled games are skipped: nobody played
 * them, so nobody owes for them.
 */
export const fetchPlayedGameResponses = async (
	seasonId: string,
	games: Game[]
): Promise<{ gameId: string; responses: GameResponse[] }[]> => {
	const played = games.filter(game => game.status !== 'cancelled' && hasBeenPlayed(game));

	return Promise.all(
		played.map(async game => {
			const snapshot = await getDocs(responsesCol(seasonId, game.id));

			return { gameId: game.id, responses: asData<GameResponse>()(snapshot.docs) };
		})
	);
};
