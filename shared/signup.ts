import { civilDayNumber, zonedCivilDate } from './datetime';
import type { PlannedDue } from './finances';
import { dueId, entryShare, feesFor } from './finances';
import type { KitItem, Season, Signup } from './types';

/** What confirming a season will write, worked out before anything is written. */
export interface ConfirmationPlan {
	memberUids: string[];
	/** The season's admins who are staying on, in their original order. The confirmer when none of them signed up. */
	adminUids: string[];
	/** Admins who did not sign up. They lose the role with the roster. */
	demotedAdminUids: string[];
	dues: PlannedDue[];
	share: number;
	kit: Omit<KitItem, 'id' | 'updatedAt'>[];
}

/** What each person owes if `yesCount` people sign up. Zero for nobody. */
export const signupShare = (season: Pick<Season, 'fees'>, yesCount: number): number =>
	entryShare(feesFor(season).total, yesCount);

/**
 * The squad, the admins, the charges and the kit that confirming a draft
 * produces. The confirmer's own yes is the caller's check, which is also why
 * they can stand in as the admin when no admin said yes: a season is never left
 * with nobody to run it. Kit held by somebody
 * who is not in the squad moves to the confirmer so it always has a holder.
 */
export const planConfirmation = (
	signups: Signup[],
	season: Pick<Season, 'adminUids' | 'fees'>,
	sourceKit: KitItem[],
	confirmerUid: string
): ConfirmationPlan => {
	const memberUids = signups
		.filter(signup => signup.status === 'yes')
		.map(signup => signup.uid)
		.sort();
	const members = new Set(memberUids);
	const share = signupShare(season, memberUids.length);
	const keptAdmins = season.adminUids.filter(uid => members.has(uid));

	return {
		memberUids,
		adminUids: keptAdmins.length > 0 ? keptAdmins : [confirmerUid],
		demotedAdminUids: season.adminUids.filter(uid => !members.has(uid)),
		dues: share > 0 ? memberUids.map(uid => ({ id: dueId('entry', uid), uid, kind: 'entry', amount: share })) : [],
		share,
		kit: sourceKit.map(({ name, kind, holderUid }) => ({
			name,
			kind,
			holderUid: members.has(holderUid) ? holderUid : confirmerUid,
			updatedBy: confirmerUid,
		})),
	};
};

const REMINDER_EVERY_DAYS = 3;

/**
 * Whether today is a day to nudge people who have not answered a season that
 * is signing up. Every third civil day after the one it was created on, in the
 * season's own timezone, up to and including the close date. Quiet seasons and
 * seasons that are already running are never nudged.
 */
export const signupReminderDue = (
	season: Pick<Season, 'status' | 'quiet' | 'signupClosesOn' | 'createdAt' | 'slot'>,
	now: Date
): boolean => {
	if (season.status !== 'draft' || season.quiet) return false;

	const { timezone } = season.slot;
	const today = zonedCivilDate(now.toISOString(), timezone);
	if (season.signupClosesOn && today > season.signupClosesOn) return false;

	const age = civilDayNumber(today) - civilDayNumber(zonedCivilDate(season.createdAt, timezone));
	return age > 0 && age % REMINDER_EVERY_DAYS === 0;
};
