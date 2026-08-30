import { isAbsent, isConfirmed } from './game';
import { DEFAULT_FEES } from './types';
import type { Due, DueKind, Expense, GameResponse, Season, SeasonFees } from './types';

/**
 * What is owed, what has come in, and what is left.
 *
 * The load-bearing decision here is that a charge is a stored document rather
 * than a sum computed on the fly, and it is worth writing down why, because
 * `kit.ts` argues the opposite case for kit and is right about that one.
 *
 * A derived charge cannot be settled. "Paid" is a stored fact, and it is stored
 * against something. If the charge underneath it is a calculation, then an admin
 * marking an extra absent a week later silently deletes a charge that has
 * already been paid, and the payment is left pointing at nothing. Storing it
 * freezes the amount and the role at the moment it is raised, which also settles
 * the two cases that otherwise need special handling: moving the fee in March
 * does not re-price February, and an extra who is later made a member still owes
 * for the games they played as an extra.
 *
 * So this module does not decide what anybody owes. It works out which charges
 * *ought* to exist, hands the difference to an admin, and totals up the ones
 * that do.
 */

export const feesFor = (season: Pick<Season, 'fees'>): SeasonFees => ({ ...DEFAULT_FEES, ...season.fees });

/**
 * One member's share of the season's bill.
 *
 * The bill split equally, rounded up. Up rather than to nearest, because the
 * shares have to cover the invoice and 31240 across 18 members is 1735.55
 * each: rounding down leaves the group ten kronor short of a pitch they have
 * already booked, and rounding up leaves it eight kronor over. Over is a
 * rounding error, short is a phone call.
 *
 * An empty squad is zero rather than a division by zero. A season with no
 * members yet has nobody to charge, which is not the same as a bill of nothing,
 * so nothing is what gets raised until somebody joins.
 *
 * Takes the bill rather than the whole `SeasonFees`, so the settings form can
 * show what the number somebody is typing would mean per person before it is a
 * season's fees at all.
 */
export const entryShare = (total: number, memberCount: number): number =>
	memberCount > 0 ? Math.ceil(total / memberCount) : 0;

/**
 * The document id a charge gets, derived from what it is a charge *for*.
 *
 * This is what makes raising charges safe to do twice. A random id would mean a
 * second tap on "raise the missing charges", or two admins tapping at once,
 * quietly charging everybody again; a derived one collides with the charge that
 * already exists, and the write is refused rather than duplicated.
 */
export const dueId = (kind: DueKind, uid: string, gameId?: string): string =>
	kind === 'entry' ? `entry_${uid}` : `game_${gameId}_${uid}`;

/**
 * Whether this response is one an extra should be charged for.
 *
 * Confirmed and not absent. Both halves matter and both come from `game.ts`
 * rather than being re-tested here: an extra whose In was never confirmed never
 * had a spot, and one who was marked absent never played. `role` is read off the
 * response, which is where it was snapshotted, so this stays true about the game
 * it describes no matter who has joined the squad since.
 */
export const owesForGame = (response: GameResponse): boolean =>
	response.role === 'extra' && response.status === 'in' && isConfirmed(response) && !isAbsent(response);

/** A charge that ought to exist, before anybody has raised it. */
export interface PlannedDue {
	id: string;
	uid: string;
	kind: DueKind;
	amount: number;
	gameId?: string;
}

/**
 * Every charge this season ought to have, given who is in the squad and who
 * played.
 *
 * Members are charged their share of the bill whether or not they have played
 * yet, because that is what buying into a season is. Extras are charged per game
 * out of the responses to the games that have actually been played, which is the
 * only place the answer lives.
 *
 * A fee of zero raises nothing rather than raising a charge for nothing, so a
 * season with no bill simply has no entry-fee side.
 *
 * The share is worked out from the squad as it stands right now and then frozen
 * on each charge. A member joining later moves the share for everybody who has
 * not been charged yet and leaves the ones already raised alone, which is the
 * behaviour that keeps a paid charge meaning what it said when it was paid. An
 * admin who wants the whole squad re-split deletes the unpaid charges and sweeps
 * again.
 */
export const planDues = (
	season: Pick<Season, 'memberUids' | 'fees'>,
	responsesByGame: { gameId: string; responses: GameResponse[] }[]
): PlannedDue[] => {
	const fees = feesFor(season);
	const planned: PlannedDue[] = [];
	const share = entryShare(fees.total, season.memberUids.length);

	if (share > 0) {
		for (const uid of season.memberUids) {
			planned.push({ id: dueId('entry', uid), uid, kind: 'entry', amount: share });
		}
	}

	if (fees.perGame > 0) {
		for (const { gameId, responses } of responsesByGame) {
			for (const response of responses) {
				if (!owesForGame(response)) continue;

				planned.push({
					id: dueId('game', response.uid, gameId),
					uid: response.uid,
					kind: 'game',
					amount: fees.perGame,
					gameId,
				});
			}
		}
	}

	return planned;
};

/**
 * The planned charges that have not been raised yet.
 *
 * By id and nothing else. A charge that exists is left alone whatever it now
 * says, because an admin may have waived it, marked it paid, or edited the
 * amount, and none of those are things a sweep for missing charges should undo.
 */
export const missingDues = (planned: PlannedDue[], existing: Pick<Due, 'id'>[]): PlannedDue[] => {
	const raised = new Set(existing.map(due => due.id));

	return planned.filter(due => !raised.has(due.id));
};

/** What has been raised, and how much of it has come in. Common to both sides. */
interface Collection {
	/** Raised, ignoring whether it was ever collected. */
	charged: number;
	collected: number;
	/** Raised, not collected, not waived. The number that means "chase somebody". */
	outstanding: number;
	waived: number;
}

/**
 * The entry fees, which are not a pot.
 *
 * They exist to pay one bill and nothing else, so the question about them is
 * never "how much is there to spend", it is "is the season paid for". Hence
 * `short` rather than a balance, and no `spent` at all: nothing is ever spent
 * out of this side.
 */
export interface EntryFund extends Collection {
	/** The season's bill, which is what these fees are collected against. */
	target: number;
	/**
	 * Bill less collected, floored at zero.
	 *
	 * Floored because a season cannot be more than paid for. Rounding the shares
	 * up means a full squad usually pays a few kronor over the bill, and a
	 * negative shortfall reads as though the group is owed change it is not.
	 */
	short: number;
}

/** The extras' money, which is the one thing here that behaves like a pot. */
export interface EquipmentFund extends Collection {
	spent: number;
	/** Collected less spent. What the group could actually go and buy something with. */
	balance: number;
}

export interface FinanceSummary {
	entry: EntryFund;
	extras: EquipmentFund;
}

const emptyCollection = (): Collection => ({ charged: 0, collected: 0, outstanding: 0, waived: 0 });

/**
 * Both sides of the books, from the charges, the expenses and the bill.
 *
 * Two shapes rather than one repeated, because the two sides answer different
 * questions and folding them into a single `PotSummary` meant carrying a `spent`
 * that is always zero on the entry side and a `target` that means nothing on the
 * extras side. The bill comes in as a number rather than off the season, so this
 * stays a fold over what it is given.
 */
export const summarise = (dues: Due[], expenses: Expense[], target = 0): FinanceSummary => {
	const entry: EntryFund = { ...emptyCollection(), target, short: target };
	const extras: EquipmentFund = { ...emptyCollection(), spent: 0, balance: 0 };

	for (const due of dues) {
		const side: Collection = due.kind === 'entry' ? entry : extras;

		side.charged += due.amount;
		if (due.status === 'paid') side.collected += due.amount;
		if (due.status === 'waived') side.waived += due.amount;
		if (due.status === 'owing') side.outstanding += due.amount;
	}

	for (const expense of expenses) {
		extras.spent += expense.amount;
	}

	entry.short = Math.max(0, target - entry.collected);
	extras.balance = extras.collected - extras.spent;

	return { entry, extras };
};

/** One player's charges, newest first, with what they still owe. */
export interface PlayerDues {
	dues: Due[];
	outstanding: number;
}

export const duesFor = (uid: string, dues: Due[]): PlayerDues => {
	const mine = dues.filter(due => due.uid === uid);

	return {
		dues: [...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
		outstanding: mine.reduce((total, due) => (due.status === 'owing' ? total + due.amount : total), 0),
	};
};

export interface PlayerLedger extends PlayerDues {
	uid: string;
	charged: number;
}

/**
 * The book by person, whoever owes the most first.
 *
 * Debt order rather than alphabetical, because the question this list answers is
 * "who do I need to chase", and a name is a slower way to find that than a
 * number. Everybody settled up sorts below everybody who hasn't, in charge order
 * so the list is still stable, and the uid breaks the last tie so two people who
 * owe the same never swap places between renders.
 */
export const duesByPlayer = (dues: Due[]): PlayerLedger[] => {
	const uids = [...new Set(dues.map(due => due.uid))];

	return uids
		.map(uid => {
			const mine = duesFor(uid, dues);

			return { uid, ...mine, charged: mine.dues.reduce((total, due) => total + due.amount, 0) };
		})
		.sort((a, b) => b.outstanding - a.outstanding || b.charged - a.charged || a.uid.localeCompare(b.uid));
};

/**
 * What the payer writes on the payment, and what the admin reads to work out
 * whose it was.
 *
 * The player's name rather than their uid, because a human reads this off a
 * bank statement. The season's name is what distinguishes two groups collecting
 * to the same number.
 */
export const paymentReference = (seasonName: string, displayName: string): string =>
	`${seasonName}: ${displayName}`.slice(0, 50);
