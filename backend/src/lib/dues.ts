import { logger } from 'firebase-functions';
import type { AppUser, Due, Season } from '../../../shared/types';
import type { PlannedDue } from '../../../shared/finances';
import { feesFor, planGameDues } from '../../../shared/finances';
import { formatGameDate } from '../../../shared/format';
import { db } from './firebase';
import { getGame, getProfiles, getResponses } from './data';
import { sendDueRaised } from './push';
import { reportError } from './sentry';

/**
 * Charging the extras who played, the moment the game is confirmed, and telling
 * them.
 *
 * The books are otherwise the one part of this app no function writes to.
 * `docs/finances.md` says the app does the arithmetic and an admin does the
 * writing, and the finances screen's sweep is that writing. This is the one
 * charge that can be raised without anybody deciding anything, because
 * confirming a result is already the moment a game stops being provisional. The
 * lineup is frozen, the absences are in, and the role on each response is the
 * one it will still carry next year. Everything `owesForGame` reads has settled,
 * so there is nothing left for an admin to weigh up.
 *
 * What it closes is the gap. An extra played on Tuesday, and the charge appeared
 * whenever an admin next opened the books and pressed a button, which was often
 * the week somebody chased them for it. Now it lands with the ratings and the
 * vote, while they still remember playing, on the screen that draws the Swish
 * code.
 *
 * The sweep is untouched and is still the backstop. It plans by the same
 * `planGameDues` and compares by id, so it finds nothing to do for a game this
 * has covered, and a season whose fees were set after the fact, or a game
 * confirmed while this was failing, is still one press away.
 */

const dueRef = (seasonId: string, dueId: string) => db.doc(`seasons/${seasonId}/dues/${dueId}`);

/**
 * Whether owing this season money also stops somebody signing up for the next
 * game, which is what decides the last sentence of both money notifications.
 *
 * Here rather than beside either sender, because `remindDebtors` and the bill
 * below both ask it and the two must answer the same way. It is also the same
 * test `debtStanding` makes on the client, and it has to stay that, or a
 * notification contradicts the notice the season home is already showing.
 *
 * A season admin owes their share like everybody else and is never blocked by
 * it. The season usually collects to their own number, Swish refuses a payment
 * to yourself, and an admin locked out of signing up cannot mark the payment
 * that would let them back in. The global badge outranks the per-season one
 * here as it does everywhere else.
 *
 * `isAppAdmin` is the mirror on the profile rather than the custom claim it
 * mirrors, for the reason `getAppAdminUids` gives. Reading the claim would mean
 * paging Firebase Auth, and this decides a sentence rather than a permission. A
 * stale mirror costs somebody the wrong half of a body, not a way in.
 */
export const isBlockedBy = (season: Season, uid: string, profile?: AppUser): boolean =>
	!season.adminUids.includes(uid) && profile?.isAppAdmin !== true;

/**
 * Tell each extra what they have just been charged.
 *
 * One send per person, because the copy names their own amount and says whether
 * their own next In is held. In parallel for the reason `remindDebtors` chases
 * in parallel: each is an independent send to a different person, and a game
 * with four extras in it would otherwise be four FCM round trips end to end.
 *
 * Reported and swallowed. The charges are already written by the time this runs,
 * and a notification that failed is not a reason to leave the books wrong or to
 * cost the man-of-the-match vote that sends straight after it. What it costs is
 * somebody finding out when they next open the app, which is where they were
 * before any of this existed, and an admin can still chase them from the books.
 *
 * **Nothing is stamped on the mark.** `remindedAt` means a chase reached them,
 * and the books draw it as "chased two days ago" beside a name. This is the bill
 * arriving rather than somebody asking about it, so the next admin to open the
 * books should still read that nobody has followed it up.
 */
const tellThem = async (seasonId: string, gameId: string, season: Season, raised: PlannedDue[]): Promise<void> => {
	const [game, profiles] = await Promise.all([getGame(seasonId, gameId), getProfiles(raised.map(due => due.uid))]);

	// A charge is read against the memory of a Tuesday, so the date is the one
	// `dueLabel` puts on the same charge in the books rather than a kick-off
	// time nobody is reconciling anything against. The game cannot really be
	// missing, it was confirmed a moment ago, but a notification is not worth
	// throwing over and today is the closest true thing left to say.
	const when = formatGameDate(game?.kickoff ?? new Date().toISOString(), season.slot.timezone);

	const sent = await Promise.all(
		raised.map(due =>
			sendDueRaised(due.uid, {
				seasonId,
				seasonName: season.name,
				gameId,
				amount: due.amount,
				when,
				blocked: isBlockedBy(season, due.uid, profiles.get(due.uid)),
			})
		)
	);

	logger.info('Told the extras what they owe', {
		seasonId,
		gameId,
		told: sent.length,
		pushed: sent.reduce((total, result) => total + result.pushed, 0),
		emailed: sent.reduce((total, result) => total + result.emailed, 0),
	});
};

/**
 * Raise the per-game charges for a game that has just been confirmed, tell the
 * people they land on, and report how many were new.
 *
 * **Only ever creates.** The Admin SDK is not subject to the rules, so the
 * `onlySettles()` guard that stops the client's sweep resetting a paid charge is
 * not there to catch this one. A blind `set` on the derived id would take a
 * charge an extra had already paid, on a game an admin then un-confirmed and
 * confirmed again, and quietly put it back to owing.
 *
 * The read and the write are one transaction for the same reason. The other
 * thing an admin is doing while this runs is marking payments, and a charge
 * settled between a read and a write outside one would be overwritten by a
 * decision made before it existed.
 *
 * **The people told are the people on the charges this call wrote, and nobody
 * else.** That is narrower than the lineup twice over. `owesForGame` has already
 * dropped everybody who played as a member, every extra an admin never gave a
 * spot to, and everybody marked absent, so the only names left are the ones the
 * books are about to hold a charge against for this game. Then the transaction
 * drops whatever was already raised, which is what keeps a re-confirmed game
 * silent and leaves somebody an admin swept up last week out of it: a bill for a
 * Tuesday they have already been chased about, or paid for, is a notification
 * about nothing that happened. That is why this hands back the charges rather
 * than a count.
 *
 * `onDueWrite` picks each charge up and marks the player, which is what holds
 * their next In. The screens draw their notice off the player's own charges
 * rather than off the mark, so it is on the season home before the trigger has
 * finished, and the notification lands on a screen that already agrees with it.
 */
export const raiseGameDues = async (seasonId: string, gameId: string, season: Season): Promise<number> => {
	const fees = feesFor(season);
	const planned = planGameDues(fees, gameId, await getResponses(seasonId, gameId));

	if (planned.length === 0) return 0;

	const createdAt = new Date().toISOString();

	const raised = await db.runTransaction(async transaction => {
		// Kept by id rather than zipped back onto the reads by position. `getAll`
		// does answer in the order it was asked, but this is the one place where
		// lining two arrays up wrongly would charge one player and send the bill
		// to another, and an id is what says who a charge is against: it is what
		// `missingDues` compares on, and nothing else. Keying on it also means two
		// responses naming the same player, which only a season admin writing by
		// hand could produce, cannot put the same document into the batch twice.
		const wanted = new Map(planned.map(due => [due.id, due]));
		const existing = await transaction.getAll(...[...wanted.keys()].map(id => dueRef(seasonId, id)));

		for (const snapshot of existing) {
			if (snapshot.exists) wanted.delete(snapshot.id);
		}

		for (const due of wanted.values()) {
			const document: Omit<Due, 'id'> = {
				uid: due.uid,
				kind: due.kind,
				amount: due.amount,
				gameId,
				status: 'owing',
				createdAt,
			};

			transaction.set(dueRef(seasonId, due.id), document);
		}

		return [...wanted.values()];
	});

	// Silent when a confirmation found every charge already raised, which is what
	// a re-confirmed game and an admin who got there first both look like. Nobody
	// is told either, for the same reason.
	if (raised.length === 0) return 0;

	logger.info('Charged the extras who played', {
		seasonId,
		gameId,
		raised: raised.length,
		amount: fees.perGame,
	});

	await tellThem(seasonId, gameId, season, raised).catch(error =>
		reportError('Could not tell the extras what they owe', { seasonId, gameId }, error)
	);

	return raised.length;
};
