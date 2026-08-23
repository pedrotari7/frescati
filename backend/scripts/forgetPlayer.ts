/**
 * Removes a person from Frescati, as far as they can be removed.
 *
 * There is no self-serve deletion and `users/{uid}` is `allow delete: if false`,
 * deliberately. A profile is what every roster renders names and avatars from,
 * so a missing one turns a squad list into a wall of "Unknown player". This is
 * what happens instead when somebody asks to be taken off.
 *
 * The split it draws is between data that is *about* a person and data that is a
 * *shared record*:
 *
 *   Erased: the Firebase Auth account and the address in it, the display name,
 *   the avatar, the device notes, every registered push token, and the free-text
 *   note on every response they ever wrote.
 *
 *   Kept: the uid itself, wherever it appears in something more than one person
 *   took part in: `ratingLedger`, the generated lineups, the scoreboard's
 *   `updatedBy`, and the in/out of each response. Those are not theirs alone. The
 *   ledger especially: it is the undo history for the *whole* ladder, and
 *   `replayRatingsFrom` rebuilds each game from the state the one before it
 *   left, so deleting one player's entries would not lose only their history,
 *   it would corrupt every replay for everybody who ever played alongside them.
 *
 * What survives is therefore an opaque id with nothing attached to it, which is
 * the most that can be taken away without rewriting other people's results.
 *
 * `rating` is kept for the same reason and is worth being explicit about: it is
 * a number the ledger can reproduce, so clearing it here would only put the
 * profile out of step with the entries that explain it.
 *
 * Safe to run repeatedly. Every step is idempotent, and a second run reports
 * that there is nothing left to do.
 *
 * Usage:
 *   pnpm --filter backend forget-player <uid|email>
 *   pnpm --filter backend forget-player <uid|email> --dry-run
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { counted } from '../../shared/format';
import { UsageError, runScript } from './lib/script';
import type { ScriptContext } from './lib/script';

/** What a roster shows where the name used to be. */
const FORMER_PLAYER = 'Former player';

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 400;

/**
 * Accepts either form, because whoever asks to be forgotten writes from an
 * address and the database only knows uids.
 */
const resolveUid = async (identifier: string): Promise<{ uid: string; email?: string; hasAccount: boolean }> => {
	const lookUp = identifier.includes('@') ? getAuth().getUserByEmail(identifier) : getAuth().getUser(identifier);

	const user = await lookUp.catch(() => null);

	if (user) return { uid: user.uid, email: user.email, hasAccount: true };

	// The account may already be gone from a half-finished earlier run, which
	// must not stop this from clearing up whatever it left in Firestore.
	if (identifier.includes('@')) {
		throw new Error(`No account for ${identifier}. Re-run with the uid if the account is already deleted.`);
	}

	return { uid: identifier, hasAccount: false };
};

interface Plan {
	profile: QueryDocumentSnapshot | null;
	/** Fields on the profile that still hold something personal. */
	profileFields: string[];
	tokens: QueryDocumentSnapshot[];
	notes: QueryDocumentSnapshot[];
	memberOf: QueryDocumentSnapshot[];
	adminOf: QueryDocumentSnapshot[];
	/** Kit still recorded as theirs. Reported, never cleared, see `describe`. */
	holds: QueryDocumentSnapshot[];
}

const buildPlan = async (db: Firestore, uid: string): Promise<Plan> => {
	const [profileSnap, tokensSnap, responsesSnap, seasonsSnap, kitSnap] = await Promise.all([
		db.doc(`users/${uid}`).get(),
		db.collection(`users/${uid}/pushTokens`).get(),
		// Every answer they ever gave, across every season, in one query, the
		// same collection-group index the app's own "my answers" listener uses.
		db.collectionGroup('responses').where('uid', '==', uid).get(),
		db.collection('seasons').get(),
		// Same shape of query, and it rides the same automatic single-field
		// index, nothing has to be declared for either.
		db.collectionGroup('kit').where('holderUid', '==', uid).get(),
	]);

	const profile = profileSnap.exists ? (profileSnap as QueryDocumentSnapshot) : null;

	const profileFields = ['displayName', 'photoURL', 'client', 'email'].filter(field => {
		const value = profile?.get(field);

		// `displayName` is the one that can be *present but already cleared*, so
		// it needs the extra comparison to stay idempotent.
		return value !== undefined && value !== null && !(field === 'displayName' && value === FORMER_PLAYER);
	});

	return {
		profile,
		profileFields,
		tokens: tokensSnap.docs,
		// Only the note is theirs to erase. The in/out is part of a headcount
		// somebody organised a game around.
		notes: responsesSnap.docs.filter(doc => doc.get('note')),
		memberOf: seasonsSnap.docs.filter(doc => (doc.get('memberUids') ?? []).includes(uid)),
		adminOf: seasonsSnap.docs.filter(doc => (doc.get('adminUids') ?? []).includes(uid)),
		holds: kitSnap.docs,
	};
};

const row = (label: string, detail: string): string => `  ${label.padEnd(18)}${detail}`;

const describeProfile = (plan: Plan): string => {
	if (!plan.profile) return 'no profile document';
	if (plan.profileFields.length === 0) return 'already anonymised';

	return `clear ${plan.profileFields.join(', ')}`;
};

const describe = (plan: Plan, email: string | undefined, hasAccount: boolean): void => {
	console.log('');
	console.log(row('Firebase Auth', hasAccount ? `delete account${email ? ` (${email})` : ''}` : 'already gone'));
	console.log(row('profile', describeProfile(plan)));
	console.log(row('pushTokens', `${plan.tokens.length} to delete`));
	console.log(row('responses', `${counted(plan.notes.length, 'note')} to clear`));
	console.log(row('seasons', `member of ${plan.memberOf.length}, admin of ${plan.adminOf.length}`));

	// Left exactly where it is, and said out loud because it is the one thing
	// here that somebody has to act on in the real world. Coming off the roster
	// strands whatever they were holding, which the season's kit screen then
	// flags. Reassigning it here would guess who has the ball, and quietly
	// guessing wrong is worse than a register that says it doesn't know.
	if (plan.holds.length > 0) {
		console.log(
			row('kit', `${plan.holds.map(doc => doc.get('name')).join(', ')}: still recorded as theirs, chase it`)
		);
	}

	console.log('\n  Kept: rating, and the uid wherever it appears in shared history:');
	console.log('  ratingLedger, lineups, scores and the in/out of each response.');
};

/** Returns the seasons left untouched because they would have been orphaned. */
const apply = async (db: Firestore, plan: Plan, uid: string, hasAccount: boolean): Promise<string[]> => {
	const stranded: string[] = [];
	let batch = db.batch();
	let queued = 0;

	const enqueue = async (write: () => void): Promise<void> => {
		write();
		queued++;

		if (queued >= BATCH_LIMIT) {
			await batch.commit();
			batch = db.batch();
			queued = 0;
		}
	};

	if (plan.profile && plan.profileFields.length > 0) {
		await enqueue(() =>
			batch.update(plan.profile!.ref, {
				displayName: FORMER_PLAYER,
				photoURL: null,
				client: FieldValue.delete(),
				email: FieldValue.delete(),
			})
		);
	}

	for (const token of plan.tokens) await enqueue(() => batch.delete(token.ref));
	for (const note of plan.notes) await enqueue(() => batch.update(note.ref, { note: FieldValue.delete() }));

	// A season admin who is also being forgotten has to come off `adminUids`
	// too, and the rules refuse to leave a season with none, which is a real
	// stop, not something to work around, so it is reported rather than forced.
	for (const season of plan.memberOf) {
		await enqueue(() => batch.update(season.ref, { memberUids: FieldValue.arrayRemove(uid) }));
	}

	for (const season of plan.adminOf) {
		const remaining = (season.get('adminUids') ?? []).filter((admin: string) => admin !== uid);

		if (remaining.length === 0) {
			stranded.push(season.id);
			continue;
		}

		await enqueue(() => batch.update(season.ref, { adminUids: FieldValue.arrayRemove(uid) }));
	}

	if (queued > 0) await batch.commit();

	// Last, so a failure anywhere above leaves an account that can still be
	// looked up by email on the next run.
	if (hasAccount) await getAuth().deleteUser(uid);

	return stranded;
};

export const main = async ({ db, projectId, dryRun, args }: ScriptContext) => {
	const identifier = args[0];

	if (!identifier) throw new UsageError('Usage: pnpm --filter backend forget-player <uid|email> [--dry-run]');

	const { uid, email, hasAccount } = await resolveUid(identifier);
	const plan = await buildPlan(db, uid);

	console.log(`Forgetting ${uid}${email ? ` (${email})` : ''} in ${projectId}:`);
	describe(plan, email, hasAccount);

	const nothingToDo =
		!hasAccount &&
		plan.profileFields.length === 0 &&
		plan.tokens.length === 0 &&
		plan.notes.length === 0 &&
		plan.memberOf.length === 0 &&
		plan.adminOf.length === 0;

	if (nothingToDo) {
		console.log('\nNothing left to do.');
		return;
	}

	if (dryRun) {
		console.log('\nDry run, nothing written.');
		return;
	}

	const stranded = await apply(db, plan, uid, hasAccount);

	if (stranded.length === 0) {
		console.log('\nDone. They are an id with nothing attached to it.');
		return;
	}

	// Said as the last thing, and not as "done": the rules refuse to leave a
	// season without an admin, and that is a real stop rather than something to
	// work around. Leaving it unsaid would mean somebody reads "Done" while a
	// season still lists them by name in its admin list.
	console.log(
		`\nAlmost. Still an admin of ${stranded.join(', ')}. Appointing somebody else there and re-running is what finishes it.`
	);
};

// Only when run as a command. Importing this from a test must not delete an
// account as a side effect of the import, and `runScript` would otherwise reach
// for real credentials and a real project before any test body had run.
if (require.main === module) runScript(main);
