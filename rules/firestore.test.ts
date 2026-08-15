import { readFileSync } from 'fs';
import { join } from 'path';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
	collection,
	collectionGroup,
	deleteDoc,
	deleteField,
	doc,
	getDoc,
	getDocs,
	increment,
	query,
	setDoc,
	updateDoc,
	where,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-frescati';
const SEASON = 'season-1';
const GAME = 'game-1';
const LOCKED_GAME = 'game-locked';

const APP_ADMIN = 'app-admin';
const SEASON_ADMIN = 'season-admin';
const MEMBER = 'member-1';
const OTHER_MEMBER = 'member-2';
const EXTRA = 'extra-1';

let testEnv: RulesTestEnvironment;

const authed = (uid: string, claims?: Record<string, unknown>) => testEnv.authenticatedContext(uid, claims).firestore();

const seasonDoc = () => `seasons/${SEASON}`;
const gameDoc = () => `seasons/${SEASON}/games/${GAME}`;
const lockedGameDoc = () => `seasons/${SEASON}/games/${LOCKED_GAME}`;
const responseDoc = (uid: string) => `seasons/${SEASON}/games/${GAME}/responses/${uid}`;
const lockedResponseDoc = (uid: string) => `seasons/${SEASON}/games/${LOCKED_GAME}/responses/${uid}`;

const aGame = (kickoff: string, endsAt: string) => ({
	seasonId: SEASON,
	kickoff,
	// Rules can't parse ISO 8601, so the deadline is enforced against this.
	kickoffMillis: Date.parse(kickoff),
	endsAt,
	venue: { name: 'Frescati IP' },
	status: 'scheduled',
	isOneOff: false,
	counts: { membersIn: 0, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 0 },
	atRisk: true,
	createdAt: '2026-08-01T00:00:00.000Z',
	createdBy: SEASON_ADMIN,
});

const aResponse = (uid: string, role: 'member' | 'extra', extras: Record<string, unknown> = {}) => ({
	uid,
	status: 'in',
	role,
	respondedAt: '2026-08-30T10:00:00.000Z',
	updatedAt: '2026-08-30T10:00:00.000Z',
	...extras,
});

beforeAll(async () => {
	testEnv = await initializeTestEnvironment({
		projectId: PROJECT_ID,
		firestore: { rules: readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8') },
	});
});

afterAll(async () => {
	await testEnv.cleanup();
});

beforeEach(async () => {
	await testEnv.clearFirestore();

	await testEnv.withSecurityRulesDisabled(async context => {
		const db = context.firestore();

		await setDoc(doc(db, seasonDoc()), {
			id: SEASON,
			name: 'Autumn 2026',
			status: 'active',
			startDate: '2026-09-01',
			endDate: '2026-12-15',
			venue: { name: 'Frescati IP' },
			slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'Europe/Stockholm' },
			minPlayers: 10,
			responseDeadlineHours: 24,
			reminderHours: [72, 24],
			memberUids: [MEMBER, OTHER_MEMBER, SEASON_ADMIN],
			adminUids: [SEASON_ADMIN],
			createdAt: '2026-08-01T00:00:00.000Z',
			createdBy: APP_ADMIN,
		});

		await setDoc(doc(db, gameDoc()), aGame('2026-09-01T17:00:00.000Z', '2026-09-01T18:30:00.000Z'));

		// Kicks off in an hour, so it is already inside the season's 24h
		// response deadline. Relative to now, not a fixed date, so the suite
		// doesn't quietly stop testing the locked path once that date passes.
		const soon = new Date(Date.now() + 3_600_000);
		await setDoc(
			doc(db, lockedGameDoc()),
			aGame(soon.toISOString(), new Date(soon.getTime() + 5_400_000).toISOString())
		);
	});
});

describe('users', () => {
	it('lets anyone signed in read profiles, for rosters and the member picker', async () => {
		await assertSucceeds(getDoc(doc(authed(EXTRA), `users/${MEMBER}`)));
	});

	it('blocks anonymous reads', async () => {
		await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), `users/${MEMBER}`)));
	});

	it('lets a user create their own profile', async () => {
		await assertSucceeds(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}`), { uid: MEMBER, displayName: 'A', isAppAdmin: false })
		);
	});

	it('stops a user granting themselves the admin badge on create', async () => {
		await assertFails(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}`), { uid: MEMBER, displayName: 'A', isAppAdmin: true })
		);
	});

	it('stops a user promoting themselves later', async () => {
		await setDoc(doc(authed(MEMBER), `users/${MEMBER}`), { uid: MEMBER, displayName: 'A', isAppAdmin: false });

		await assertFails(updateDoc(doc(authed(MEMBER), `users/${MEMBER}`), { isAppAdmin: true }));
	});

	// `set-admin` promotes by uid and can land before the person has ever written
	// a profile, leaving a doc holding nothing but `isAppAdmin`. Their next
	// sign-in has to be able to fill in the rest, or they stay nameless forever.
	it('lets a user complete a profile that set-admin left half-written', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), `users/${MEMBER}`), { isAppAdmin: true });
		});

		await assertSucceeds(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}`), { uid: MEMBER, displayName: 'A' }, { merge: true })
		);
	});

	it('lets a user fill in a profile that has no isAppAdmin field yet', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), `users/${MEMBER}`), { uid: MEMBER });
		});

		await assertSucceeds(
			setDoc(
				doc(authed(MEMBER), `users/${MEMBER}`),
				{ uid: MEMBER, displayName: 'A', isAppAdmin: false },
				{ merge: true }
			)
		);
	});

	it('stops a user smuggling the admin badge into a half-written profile', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), `users/${MEMBER}`), { uid: MEMBER });
		});

		await assertFails(
			setDoc(
				doc(authed(MEMBER), `users/${MEMBER}`),
				{ uid: MEMBER, displayName: 'A', isAppAdmin: true },
				{ merge: true }
			)
		);
	});

	// The bug this guards: a merge that only refreshed the display fields left a
	// half-written doc with no `uid`, so every sign-in was denied — silently.
	it('rejects a profile write that leaves the doc with no uid', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), `users/${MEMBER}`), { isAppAdmin: true });
		});

		await assertFails(setDoc(doc(authed(MEMBER), `users/${MEMBER}`), { displayName: 'A' }, { merge: true }));
	});

	it('stops a user dropping the uid off their profile', async () => {
		await setDoc(doc(authed(MEMBER), `users/${MEMBER}`), { uid: MEMBER, displayName: 'A', isAppAdmin: false });

		await assertFails(updateDoc(doc(authed(MEMBER), `users/${MEMBER}`), { uid: 'someone-else' }));
	});

	it('stops a user writing someone else’s profile', async () => {
		await assertFails(
			setDoc(doc(authed(EXTRA), `users/${MEMBER}`), { uid: MEMBER, displayName: 'hacked', isAppAdmin: false })
		);
	});

	// Every signed-in user can read every profile, so contact details must not
	// live in one. Walking seasons for memberUids and fetching those profiles is
	// enough to harvest the lot, which is why restricting `list` alone wouldn't
	// have been the fix.
	it('stops a new profile carrying an email', async () => {
		await assertFails(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A',
				isAppAdmin: false,
				email: 'member.one@example.com',
			})
		);
	});

	it('stops an email being added to an existing profile', async () => {
		await setDoc(doc(authed(MEMBER), `users/${MEMBER}`), { uid: MEMBER, displayName: 'A', isAppAdmin: false });

		await assertFails(updateDoc(doc(authed(MEMBER), `users/${MEMBER}`), { email: 'member.one@example.com' }));
	});

	// Profiles written before the field moved out still have one. Refusing those
	// outright would deny their owner's next sign-in, so they stay writable —
	// they just can't keep the address.
	it('lets a legacy profile be updated, and clears the email as it goes', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A',
				isAppAdmin: false,
				email: 'member.one@example.com',
			});
		});

		await assertSucceeds(
			setDoc(
				doc(authed(MEMBER), `users/${MEMBER}`),
				{ uid: MEMBER, displayName: 'A', email: deleteField() },
				{ merge: true }
			)
		);
	});

	it('stops a legacy email being changed rather than removed', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A',
				isAppAdmin: false,
				email: 'member.one@example.com',
			});
		});

		await assertFails(updateDoc(doc(authed(MEMBER), `users/${MEMBER}`), { email: 'someone.else@example.com' }));
	});

	it('rejects fields the profile schema does not have', async () => {
		await assertFails(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A',
				isAppAdmin: false,
				junk: 'y'.repeat(50_000),
			})
		);
	});

	it('rejects a display name nobody could have typed', async () => {
		await assertFails(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A'.repeat(101),
				isAppAdmin: false,
			})
		);
	});

	// The rating is what team selection and the ladder are built on, and this
	// document is writable by the person it describes — so it has to be frozen
	// explicitly, not merely left off the allowlist.
	it('stops a user rating themselves on create', async () => {
		await assertFails(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A',
				isAppAdmin: false,
				rating: { elo: 2000, games: 99, updatedAt: '2026-08-01T00:00:00.000Z' },
			})
		);
	});

	it('stops a user rating themselves later', async () => {
		await setDoc(doc(authed(MEMBER), `users/${MEMBER}`), { uid: MEMBER, displayName: 'A', isAppAdmin: false });

		await assertFails(
			updateDoc(doc(authed(MEMBER), `users/${MEMBER}`), {
				rating: { elo: 2000, games: 99, updatedAt: '2026-08-01T00:00:00.000Z' },
			})
		);
	});

	it('stops a user editing the rating a function gave them', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A',
				isAppAdmin: false,
				rating: { elo: 1000, games: 6, updatedAt: '2026-08-01T00:00:00.000Z' },
			});
		});

		await assertFails(
			updateDoc(doc(authed(MEMBER), `users/${MEMBER}`), {
				rating: { elo: 2000, games: 6, updatedAt: '2026-08-01T00:00:00.000Z' },
			})
		);
	});

	it('stops a user deleting a rating they do not like', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A',
				isAppAdmin: false,
				rating: { elo: 820, games: 9, updatedAt: '2026-08-01T00:00:00.000Z' },
			});
		});

		await assertFails(updateDoc(doc(authed(MEMBER), `users/${MEMBER}`), { rating: deleteField() }));
	});

	// A rated player still has to be able to change their name and their
	// notification settings — the freeze must not lock them out of their own
	// profile the way an unguarded equality check would.
	it('lets a rated user still edit the rest of their profile', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A',
				isAppAdmin: false,
				rating: { elo: 1120, games: 8, updatedAt: '2026-08-01T00:00:00.000Z' },
			});
		});

		await assertSucceeds(updateDoc(doc(authed(MEMBER), `users/${MEMBER}`), { displayName: 'Anders' }));
	});

	// `recordVisit` writes this field and nothing else, every time somebody
	// brings the app back to the foreground. The rest of the update rule reads
	// the *merged* document, so this is the one write in the app that proves a
	// single-field update still satisfies it.
	it('lets a user move their own last-seen stamp', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A',
				isAppAdmin: false,
				lastSeenAt: '2026-08-01T00:00:00.000Z',
			});
		});

		await assertSucceeds(
			updateDoc(doc(authed(MEMBER), `users/${MEMBER}`), { lastSeenAt: '2026-08-12T19:00:00.000Z' })
		);
		await assertFails(updateDoc(doc(authed(EXTRA), `users/${MEMBER}`), { lastSeenAt: '2026-08-12T19:00:00.000Z' }));
	});

	it('keeps push tokens private to their owner', async () => {
		await assertSucceeds(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}/pushTokens/tok`), { token: 'tok', createdAt: 'now' })
		);
		await assertFails(getDoc(doc(authed(EXTRA), `users/${MEMBER}/pushTokens/tok`)));
	});

	// The device notes the admin notification screen reads. Self-reported, so
	// the rules only bound them — there is nothing here to authorize against.
	it('lets a user record what they are opening the app on', async () => {
		await assertSucceeds(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A',
				isAppAdmin: false,
				client: { platform: 'ios', lastStandaloneAt: '2026-08-06T09:00:00.000Z' },
			})
		);
	});

	// Somebody who has never opened it installed simply has no timestamp — the
	// same third state a missing response document means.
	it('accepts client notes with no standalone timestamp', async () => {
		await assertSucceeds(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A',
				isAppAdmin: false,
				client: { platform: 'desktop' },
			})
		);
	});

	// `client` is a map, so the profile allowlist stops at its edge. Without a
	// shape check of its own it would be an unbounded payload hung off a
	// document every signed-in user can read.
	it('rejects junk nested inside the client notes', async () => {
		await assertFails(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A',
				isAppAdmin: false,
				client: { platform: 'ios', payload: 'y'.repeat(50_000) },
			})
		);
	});

	it('rejects an oversized platform', async () => {
		await assertFails(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A',
				isAppAdmin: false,
				client: { platform: 'i'.repeat(21) },
			})
		);
	});

	it('stops one user writing client notes onto somebody else', async () => {
		await assertFails(
			setDoc(doc(authed(EXTRA), `users/${MEMBER}`), {
				uid: MEMBER,
				displayName: 'A',
				isAppAdmin: false,
				client: { platform: 'ios' },
			})
		);
	});

	// The same reasoning as `client`, and the last map on this document without
	// it: every roster screen holds one live listener over the whole `users`
	// collection, so anything parked here is downloaded by everybody, over and
	// over.
	const aProfile = (notificationPrefs: unknown) => ({
		uid: MEMBER,
		displayName: 'A',
		isAppAdmin: false,
		notificationPrefs,
	});

	it('accepts the four notification switches', async () => {
		await assertSucceeds(
			setDoc(
				doc(authed(MEMBER), `users/${MEMBER}`),
				aProfile({ reminders: true, gameChanges: false, newPlayers: true, emailFallback: false })
			)
		);
	});

	// Absent means opted in everywhere this is read, so a profile written before
	// a preference existed must not be locked out of every future write.
	it('accepts a partial map, and a profile with no preferences at all', async () => {
		await assertSucceeds(setDoc(doc(authed(MEMBER), `users/${MEMBER}`), aProfile({ reminders: false })));
		await assertSucceeds(setDoc(doc(authed(MEMBER), `users/${MEMBER}`), aProfile({})));
	});

	it('rejects junk nested inside the notification preferences', async () => {
		await assertFails(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}`), aProfile({ reminders: true, payload: 'y'.repeat(50_000) }))
		);
		await assertFails(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}`), aProfile({ nested: { anything: { at: { all: [1, 2] } } } }))
		);
	});

	it('rejects a switch that is not a boolean', async () => {
		await assertFails(setDoc(doc(authed(MEMBER), `users/${MEMBER}`), aProfile({ reminders: 'yes please' })));
		await assertFails(setDoc(doc(authed(MEMBER), `users/${MEMBER}`), aProfile({ emailFallback: 1 })));
	});
});

describe('seasons', () => {
	it('lets any signed-in user read a season, so extras can find games', async () => {
		await assertSucceeds(getDoc(doc(authed(EXTRA), seasonDoc())));
	});

	it('lets an app admin create a season they administer', async () => {
		await assertSucceeds(
			setDoc(doc(authed(APP_ADMIN, { admin: true }), 'seasons/new'), {
				name: 'Spring',
				memberUids: [],
				adminUids: [APP_ADMIN],
			})
		);
	});

	it('stops an app admin creating a season they do not administer', async () => {
		await assertFails(
			setDoc(doc(authed(APP_ADMIN, { admin: true }), 'seasons/new'), {
				name: 'Spring',
				memberUids: [],
				adminUids: ['someone-else'],
			})
		);
	});

	it('stops a non-admin creating a season', async () => {
		await assertFails(
			setDoc(doc(authed(MEMBER), 'seasons/new'), { name: 'Spring', memberUids: [], adminUids: [MEMBER] })
		);
	});

	it('lets a season admin change the roster', async () => {
		await assertSucceeds(updateDoc(doc(authed(SEASON_ADMIN), seasonDoc()), { memberUids: [MEMBER, EXTRA] }));
	});

	it('stops a plain member changing the roster', async () => {
		await assertFails(updateDoc(doc(authed(MEMBER), seasonDoc()), { memberUids: [MEMBER, EXTRA] }));
	});

	it('stops a member adding themselves as a season admin', async () => {
		await assertFails(updateDoc(doc(authed(MEMBER), seasonDoc()), { adminUids: [SEASON_ADMIN, MEMBER] }));
	});

	it('stops a season being left with no admins', async () => {
		await assertFails(updateDoc(doc(authed(SEASON_ADMIN), seasonDoc()), { adminUids: [] }));
	});

	// A missing custom claim must read as false, not blow up the expression. The
	// season admin below carries no claims at all, so `isAppAdmin` is evaluated
	// against a token that has no `admin` key on either of these paths.
	it('treats a missing admin claim as false rather than erroring', async () => {
		await assertFails(
			setDoc(doc(authed(MEMBER), 'seasons/new'), { name: 'Spring', memberUids: [], adminUids: [MEMBER] })
		);
		await assertSucceeds(updateDoc(doc(authed(SEASON_ADMIN), seasonDoc()), { name: 'Renamed' }));
	});

	it('treats an unrelated custom claim as not being an app admin', async () => {
		await assertFails(
			setDoc(doc(authed('claims-but-not-admin', { somethingElse: true }), 'seasons/new'), {
				name: 'Spring',
				memberUids: [],
				adminUids: ['claims-but-not-admin'],
			})
		);
	});

	// The response rule multiplies `responseDeadlineHours`, and a rule that
	// errors denies — so a season admin writing a string here locked every
	// ordinary player out of every game in the season, invisibly from their own
	// account, since admins keep writing through their own rule.
	it('rejects a response deadline that is not a number', async () => {
		await assertFails(updateDoc(doc(authed(SEASON_ADMIN), seasonDoc()), { responseDeadlineHours: 'soon' }));
	});

	it('leaves games answerable after a legitimate deadline change', async () => {
		await assertSucceeds(updateDoc(doc(authed(SEASON_ADMIN), seasonDoc()), { responseDeadlineHours: 3 }));

		await assertSucceeds(setDoc(doc(authed(MEMBER), responseDoc(MEMBER)), aResponse(MEMBER, 'member')));
	});

	// `size()` works on strings too, so this passed the "never leave a season
	// without an admin" check while making `uid in adminUids` error — which
	// locked the season's own admins out of it.
	it('rejects adminUids that is not a list', async () => {
		await assertFails(updateDoc(doc(authed(SEASON_ADMIN), seasonDoc()), { adminUids: 'season-admin' }));
	});

	it('rejects memberUids that is not a list', async () => {
		await assertFails(updateDoc(doc(authed(SEASON_ADMIN), seasonDoc()), { memberUids: 'everybody' }));
	});

	// A season document is read by every signed-in user, and the seasons list
	// subscribes to all of them at once.
	it('rejects fields the season schema does not have', async () => {
		await assertFails(updateDoc(doc(authed(SEASON_ADMIN), seasonDoc()), { payload: 'y'.repeat(50_000) }));
	});

	// The allowlist stops at the edge of a map, so each one it names is bounded
	// in turn — otherwise the payload just moves one level down.
	it('rejects junk nested inside the venue, the slot or the balance levers', async () => {
		await assertFails(
			updateDoc(doc(authed(SEASON_ADMIN), seasonDoc()), {
				venue: { name: 'Frescati IP', payload: 'y'.repeat(50_000) },
			})
		);
		await assertFails(
			updateDoc(doc(authed(SEASON_ADMIN), seasonDoc()), {
				slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'Europe/Stockholm', junk: 'x' },
			})
		);
		await assertFails(
			updateDoc(doc(authed(SEASON_ADMIN), seasonDoc()), {
				balance: { randomness: 0.3, junk: { nested: [1, 2, 3] } },
			})
		);
	});

	it('accepts the settings screen saving every lever at once', async () => {
		await assertSucceeds(
			updateDoc(doc(authed(SEASON_ADMIN), seasonDoc()), {
				name: 'Autumn 2026',
				status: 'active',
				venue: { name: 'Frescati IP', address: 'Svante Arrhenius väg 4' },
				slot: { weekday: 3, time: '20:00', durationMinutes: 60, timezone: 'Europe/Stockholm' },
				startDate: '2026-09-01',
				endDate: '2026-12-15',
				minPlayers: 12,
				responseDeadlineHours: 12,
				reminderHours: [48, 12],
				balance: { matchMinutes: 6, randomness: 0.5, repeatPenalty: 0.2, repeatLookback: 3 },
			})
		);
	});
});

describe('games', () => {
	it('lets any signed-in user read a game', async () => {
		await assertSucceeds(getDoc(doc(authed(EXTRA), gameDoc())));
	});

	it('lets a season admin create a game', async () => {
		await assertSucceeds(
			setDoc(doc(authed(SEASON_ADMIN), `seasons/${SEASON}/games/new`), {
				seasonId: SEASON,
				kickoff: '2026-09-08T17:00:00.000Z',
				kickoffMillis: Date.parse('2026-09-08T17:00:00.000Z'),
				status: 'scheduled',
				counts: { membersIn: 0, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 0 },
				atRisk: true,
			})
		);
	});

	it('stops a game being created with counts already filled in', async () => {
		await assertFails(
			setDoc(doc(authed(SEASON_ADMIN), `seasons/${SEASON}/games/new`), {
				seasonId: SEASON,
				kickoff: '2026-09-08T17:00:00.000Z',
				kickoffMillis: Date.parse('2026-09-08T17:00:00.000Z'),
				status: 'scheduled',
				counts: { membersIn: 5, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 5 },
				atRisk: false,
			})
		);
	});

	it('stops a game being created under a mismatched season id', async () => {
		await assertFails(
			setDoc(doc(authed(SEASON_ADMIN), `seasons/${SEASON}/games/new`), {
				seasonId: 'some-other-season',
				kickoff: '2026-09-08T17:00:00.000Z',
				kickoffMillis: Date.parse('2026-09-08T17:00:00.000Z'),
				status: 'scheduled',
				counts: { membersIn: 0, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 0 },
				atRisk: true,
			})
		);
	});

	// Create used to check only `playing`, so the other five counters could be
	// seeded with anything and the roster would show a headcount nobody gave.
	it('stops a game being created with a non-playing counter seeded', async () => {
		await assertFails(
			setDoc(doc(authed(SEASON_ADMIN), `seasons/${SEASON}/games/new`), {
				...aGame('2026-09-08T17:00:00.000Z', '2026-09-08T18:30:00.000Z'),
				counts: { membersIn: 99, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 0 },
			})
		);
	});

	it('stops a game being created with counters missing entirely', async () => {
		await assertFails(
			setDoc(doc(authed(SEASON_ADMIN), `seasons/${SEASON}/games/new`), {
				...aGame('2026-09-08T17:00:00.000Z', '2026-09-08T18:30:00.000Z'),
				counts: { playing: 0 },
			})
		);
	});

	// Pre-filling this would silence every reminder the game was ever going to
	// send, without touching a field the update rule guards.
	it('stops a game being created with remindersSent already filled in', async () => {
		await assertFails(
			setDoc(doc(authed(SEASON_ADMIN), `seasons/${SEASON}/games/new`), {
				...aGame('2026-09-08T17:00:00.000Z', '2026-09-08T18:30:00.000Z'),
				remindersSent: [72, 24],
			})
		);
	});

	it('stops a game being created with no kickoffMillis to enforce the deadline against', async () => {
		await assertFails(
			setDoc(doc(authed(SEASON_ADMIN), `seasons/${SEASON}/games/new`), {
				seasonId: SEASON,
				kickoff: '2026-09-08T17:00:00.000Z',
				status: 'scheduled',
				counts: { membersIn: 0, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 0 },
				atRisk: true,
			})
		);
	});

	it('lets a season admin cancel a game', async () => {
		await assertSucceeds(
			updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), { status: 'cancelled', cancelledReason: 'frozen pitch' })
		);
	});

	// Reshuffle is the one write in the app that goes through a server-side
	// transform, so `reshuffleCount is number` is only safe if the rule sees the
	// value the increment produces rather than the operation. Tested against the
	// real call rather than a plain number, which is what the app sends.
	it('accepts a reshuffle bumped by an increment, not just a literal', async () => {
		await assertSucceeds(updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), { reshuffleCount: increment(1) }));
	});

	it('rejects a kickoff mirror that stops being a number', async () => {
		await assertFails(updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), { kickoffMillis: 'soon' }));
	});

	// One document per week, and every season screen subscribes to the whole
	// collection — so the same bound a season needs, for the same reason.
	it('rejects fields the game schema does not have', async () => {
		await assertFails(updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), { payload: 'y'.repeat(50_000) }));
	});

	it('rejects junk nested inside a game venue or its balance overrides', async () => {
		await assertFails(
			updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), {
				venue: { name: 'Elsewhere', payload: 'y'.repeat(50_000) },
			})
		);
		await assertFails(
			updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), { balance: { junk: { nested: [1, 2, 3] } } })
		);
	});

	// A game may override any subset of the season's levers, so a partial map
	// has to stay valid.
	it('accepts a game overriding just one balance lever', async () => {
		await assertSucceeds(updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), { balance: { matchMinutes: 8 } }));
	});

	it('stops a member cancelling a game', async () => {
		await assertFails(updateDoc(doc(authed(MEMBER), gameDoc()), { status: 'cancelled' }));
	});

	it('stops even an admin hand-editing the function-owned counts', async () => {
		await assertFails(
			updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), {
				counts: { membersIn: 99, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 99 },
			})
		);
	});

	it('stops even an admin hand-editing atRisk', async () => {
		await assertFails(updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), { atRisk: false }));
	});

	it('stops even an admin hand-editing remindersSent', async () => {
		await assertFails(updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), { remindersSent: [72, 24] }));
	});

	// The staleness guard the debounced team rebuild reads. A client able to
	// move it could make every queued rebuild think it had been superseded, and
	// the teams would quietly stop updating.
	it('stops even an admin hand-editing teamsGeneration', async () => {
		await assertFails(updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), { teamsGeneration: 99 }));
	});

	it('stops a game being created with teamsGeneration seeded', async () => {
		await assertFails(
			setDoc(doc(authed(SEASON_ADMIN), `seasons/${SEASON}/games/new`), {
				seasonId: SEASON,
				kickoff: '2026-09-08T17:00:00.000Z',
				kickoffMillis: Date.parse('2026-09-08T17:00:00.000Z'),
				status: 'scheduled',
				counts: { membersIn: 0, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 0 },
				atRisk: true,
				teamsGeneration: 99,
			})
		);
	});

	it('lets a season admin reshuffle the teams', async () => {
		await assertSucceeds(updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), { reshuffleCount: 1 }));
	});

	it('stops a member reshuffling the teams', async () => {
		await assertFails(updateDoc(doc(authed(MEMBER), gameDoc()), { reshuffleCount: 1 }));
	});
});

describe('the generated lineup', () => {
	const teamsDoc = () => `seasons/${SEASON}/games/${GAME}/tournament/teams`;

	const someTeams = () => ({
		teams: [
			{ index: 0, uids: [MEMBER, SEASON_ADMIN] },
			{ index: 1, uids: [OTHER_MEMBER, EXTRA] },
		],
		elos: { [MEMBER]: 1000, [OTHER_MEMBER]: 1000, [SEASON_ADMIN]: 1000, [EXTRA]: 1000 },
		seed: 1,
		settings: { randomness: 0.3, repeatPenalty: 0.4, repeatLookback: 4, matchMinutes: 5 },
		generation: 1,
		builtAt: '2026-08-30T10:00:00.000Z',
	});

	const seedTeams = async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), teamsDoc()), someTeams());
		});
	};

	it('lets any signed-in user read the team sheet', async () => {
		await seedTeams();

		await assertSucceeds(getDoc(doc(authed(EXTRA), teamsDoc())));
	});

	it('blocks anonymous reads', async () => {
		await seedTeams();

		await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), teamsDoc())));
	});

	// The whole guarantee behind Reshuffle being the only way to change a
	// lineup: nobody hand-picks the side they fancy, not even the person who
	// runs the season.
	it('stops a player writing their own lineup', async () => {
		await assertFails(setDoc(doc(authed(MEMBER), teamsDoc()), someTeams()));
	});

	it('stops a season admin writing a lineup by hand', async () => {
		await assertFails(setDoc(doc(authed(SEASON_ADMIN), teamsDoc()), someTeams()));
	});

	it('stops an app admin writing a lineup by hand', async () => {
		await assertFails(setDoc(doc(authed(APP_ADMIN, { admin: true }), teamsDoc()), someTeams()));
	});

	it('stops anyone editing a lineup that already exists', async () => {
		await seedTeams();

		await assertFails(updateDoc(doc(authed(SEASON_ADMIN), teamsDoc()), { teams: [{ index: 0, uids: [MEMBER] }] }));
	});

	it('stops anyone deleting a lineup', async () => {
		await seedTeams();

		await assertFails(deleteDoc(doc(authed(SEASON_ADMIN), teamsDoc())));
	});
});

describe('the scoreboard', () => {
	const matchDoc = (order: number) => `seasons/${SEASON}/games/${GAME}/matches/${order}`;

	const aScore = (uid: string, overrides: Record<string, unknown> = {}) => ({
		order: 0,
		teamA: 0,
		teamB: 1,
		scoreA: 3,
		scoreB: 2,
		updatedBy: uid,
		updatedAt: '2026-09-01T18:00:00.000Z',
		...overrides,
	});

	/** Someone has to have answered the game before they can score it. */
	const respond = async (uid: string, role: 'member' | 'extra') => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), responseDoc(uid)), aResponse(uid, role));
		});
	};

	const finalise = async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await updateDoc(doc(context.firestore(), gameDoc()), { resultFinalisedAt: '2026-09-02T18:00:00.000Z' });
		});
	};

	it('lets anyone playing the game enter a score', async () => {
		await respond(MEMBER, 'member');

		await assertSucceeds(setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER)));
	});

	// An extra who turned up is at the pitch like everybody else.
	it('lets an extra who answered enter a score', async () => {
		await respond(EXTRA, 'extra');

		await assertSucceeds(setDoc(doc(authed(EXTRA), matchDoc(0)), aScore(EXTRA)));
	});

	it('stops a signed-in stranger who never answered scoring the game', async () => {
		await assertFails(setDoc(doc(authed(EXTRA), matchDoc(0)), aScore(EXTRA)));
	});

	it('blocks anonymous writes', async () => {
		await assertFails(setDoc(doc(testEnv.unauthenticatedContext().firestore(), matchDoc(0)), aScore('nobody')));
	});

	it('lets a season admin score without having answered', async () => {
		await assertSucceeds(setDoc(doc(authed(SEASON_ADMIN), matchDoc(0)), aScore(SEASON_ADMIN)));
	});

	it('lets a player correct a score somebody else entered', async () => {
		await respond(MEMBER, 'member');
		await respond(OTHER_MEMBER, 'member');
		await setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER));

		await assertSucceeds(setDoc(doc(authed(OTHER_MEMBER), matchDoc(0)), aScore(OTHER_MEMBER, { scoreA: 4 })));
	});

	// Otherwise a correction could be pinned on whoever entered it first.
	it('stops a player signing a score as somebody else', async () => {
		await respond(MEMBER, 'member');

		await assertFails(setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(OTHER_MEMBER)));
	});

	it('lets anyone playing read the scoreboard', async () => {
		await respond(MEMBER, 'member');
		await setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER));

		await assertSucceeds(getDoc(doc(authed(EXTRA), matchDoc(0))));
	});

	it('rejects a score nobody could have put past a keeper', async () => {
		await respond(MEMBER, 'member');

		await assertFails(setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER, { scoreA: 100 })));
		await assertFails(setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER, { scoreA: -1 })));
	});

	it('rejects a score that is not a whole number of goals', async () => {
		await respond(MEMBER, 'member');

		await assertFails(setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER, { scoreA: 1.5 })));
	});

	it('rejects a team playing itself', async () => {
		await respond(MEMBER, 'member');

		await assertFails(setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER, { teamB: 0 })));
	});

	it('rejects a team outside the four that can exist', async () => {
		await respond(MEMBER, 'member');

		await assertFails(setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER, { teamB: 4 })));
	});

	it('rejects fields the match schema does not have', async () => {
		await respond(MEMBER, 'member');

		await assertFails(setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER, { junk: 'y'.repeat(50_000) })));
	});

	// The id is the fixture's place in the running order, and the table and
	// every rating on the game are built from whatever this collection holds.
	// Unbound, a score could be filed under an id the screen never draws and
	// still count in full — which is a way to move the ladder that leaves
	// nothing on screen to explain it.
	it('stops a score being filed under an id that disagrees with its order', async () => {
		await respond(MEMBER, 'member');

		await assertFails(setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER, { order: 5 })));
	});

	it('stops a match invented past the rotation’s hard ceiling', async () => {
		await respond(MEMBER, 'member');

		// MAX_MATCHES in shared/tournament.ts — the rule's worst case, whatever
		// the season and match length actually allow.
		await assertFails(setDoc(doc(authed(MEMBER), matchDoc(30)), aScore(MEMBER, { order: 30 })));
		await assertFails(setDoc(doc(authed(MEMBER), matchDoc(200)), aScore(MEMBER, { order: 200 })));
	});

	it('stops a match at an id that is not a number at all', async () => {
		await respond(MEMBER, 'member');

		await assertFails(
			setDoc(doc(authed(MEMBER), `seasons/${SEASON}/games/${GAME}/matches/not-a-number`), aScore(MEMBER))
		);
	});

	// Not exempt: a season admin is the one person who can still write here
	// after the game is confirmed, which is when a forged order would be
	// hardest to notice and would trigger a replay of the whole ladder.
	it('holds a season admin to the same id', async () => {
		await assertFails(setDoc(doc(authed(SEASON_ADMIN), matchDoc(0)), aScore(SEASON_ADMIN, { order: 3 })));
	});

	it('accepts every order a six-match game actually uses', async () => {
		await respond(MEMBER, 'member');

		for (const order of [0, 1, 2, 3, 4, 5]) {
			await assertSucceeds(setDoc(doc(authed(MEMBER), matchDoc(order)), aScore(MEMBER, { order })));
		}
	});

	// A rotation laps to fill the slot now, so a long slot at short matches
	// legitimately reaches well past six — the rule's job is only the outer
	// bound; `selectPlayedMatches` is what checks a game's actual fixture list.
	it('accepts an order only a longer slot would reach', async () => {
		await respond(MEMBER, 'member');

		await assertSucceeds(setDoc(doc(authed(MEMBER), matchDoc(17)), aScore(MEMBER, { order: 17 })));
		await assertSucceeds(setDoc(doc(authed(MEMBER), matchDoc(29)), aScore(MEMBER, { order: 29 })));
	});

	it('closes the scoreboard to players once the game is confirmed', async () => {
		await respond(MEMBER, 'member');
		await setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER));
		await finalise();

		await assertFails(setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER, { scoreA: 9 })));
	});

	// The replay is built to follow exactly this — without it a confirmed
	// mistake would be baked into everyone's rating forever.
	it('still lets a season admin correct a confirmed game', async () => {
		await respond(MEMBER, 'member');
		await setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER));
		await finalise();

		await assertSucceeds(setDoc(doc(authed(SEASON_ADMIN), matchDoc(0)), aScore(SEASON_ADMIN, { scoreA: 9 })));
	});

	// Deleting is on the same terms as writing. "Not played" is a real state
	// and only the absence of a document says it, so whoever scored a match
	// that never kicked off has to be able to take it back.
	it('lets a player clear a match that never happened', async () => {
		await respond(MEMBER, 'member');
		await setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER));

		await assertSucceeds(deleteDoc(doc(authed(MEMBER), matchDoc(0))));
	});

	it('lets a player clear a score somebody else entered', async () => {
		await respond(MEMBER, 'member');
		await respond(OTHER_MEMBER, 'member');
		await setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER));

		await assertSucceeds(deleteDoc(doc(authed(OTHER_MEMBER), matchDoc(0))));
	});

	it('stops a signed-in stranger who never answered clearing a score', async () => {
		await respond(MEMBER, 'member');
		await setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER));

		await assertFails(deleteDoc(doc(authed(EXTRA), matchDoc(0))));
	});

	it('closes clearing to players once the game is confirmed', async () => {
		await respond(MEMBER, 'member');
		await setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER));
		await finalise();

		await assertFails(deleteDoc(doc(authed(MEMBER), matchDoc(0))));
	});

	it('still lets a season admin delete a match from a confirmed game', async () => {
		await respond(MEMBER, 'member');
		await setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER));
		await finalise();

		await assertSucceeds(deleteDoc(doc(authed(SEASON_ADMIN), matchDoc(0))));
	});

	it('lets a season admin delete without having answered', async () => {
		await respond(MEMBER, 'member');
		await setDoc(doc(authed(MEMBER), matchDoc(0)), aScore(MEMBER));

		await assertSucceeds(deleteDoc(doc(authed(SEASON_ADMIN), matchDoc(0))));
	});

	it('stops even an admin hand-editing resultFinalisedAt on the game', async () => {
		await assertFails(updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), { resultFinalisedAt: 'now' }));
	});
});

describe('the rating ledger', () => {
	const ledgerDoc = () => `ratingLedger/${GAME}`;

	const anEntry = () => ({
		seasonId: SEASON,
		gameId: GAME,
		kickoff: '2026-09-01T17:00:00.000Z',
		kickoffMillis: Date.parse('2026-09-01T17:00:00.000Z'),
		finalisedAt: '2026-09-02T17:00:00.000Z',
		before: { [MEMBER]: { elo: 1000, games: 4, updatedAt: '2026-08-25T17:00:00.000Z' } },
		after: { [MEMBER]: { elo: 1030, games: 5, updatedAt: '2026-09-02T17:00:00.000Z' } },
	});

	const seedLedger = async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), ledgerDoc()), anEntry());
		});
	};

	it('lets any signed-in user read the ledger', async () => {
		await seedLedger();

		await assertSucceeds(getDoc(doc(authed(MEMBER), ledgerDoc())));
	});

	// This is the undo history for the whole ladder. Anyone able to edit it
	// could rewrite everybody's rating by forging what theirs used to be, and
	// the replay would faithfully apply the forgery.
	it('stops a player writing the ledger', async () => {
		await assertFails(setDoc(doc(authed(MEMBER), ledgerDoc()), anEntry()));
	});

	it('stops a season admin writing the ledger', async () => {
		await assertFails(setDoc(doc(authed(SEASON_ADMIN), ledgerDoc()), anEntry()));
	});

	it('stops an app admin writing the ledger', async () => {
		await assertFails(setDoc(doc(authed(APP_ADMIN, { admin: true }), ledgerDoc()), anEntry()));
	});

	it('stops anyone rewriting what their rating used to be', async () => {
		await seedLedger();

		await assertFails(
			updateDoc(doc(authed(MEMBER), ledgerDoc()), {
				before: { [MEMBER]: { elo: 200, games: 4, updatedAt: '2026-08-25T17:00:00.000Z' } },
			})
		);
	});

	it('stops anyone deleting a ledger entry', async () => {
		await seedLedger();

		await assertFails(deleteDoc(doc(authed(SEASON_ADMIN), ledgerDoc())));
	});
});

// The subscribable calendar's token — closed to every client, including a
// season admin. `getCalendarLink`/`rotateCalendarToken` are the only doors in,
// and both use the Admin SDK, which these rules never run against.
describe('the calendar feed token', () => {
	const tokenDoc = () => `seasons/${SEASON}/calendar/token`;
	const feedDoc = () => `calendarFeeds/some-token`;

	const seedToken = async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), tokenDoc()), {
				token: 'some-token',
				createdAt: '2026-08-01T00:00:00.000Z',
				createdBy: SEASON_ADMIN,
			});
			await setDoc(doc(context.firestore(), feedDoc()), {
				seasonId: SEASON,
				createdAt: '2026-08-01T00:00:00.000Z',
			});
		});
	};

	it.each([MEMBER, SEASON_ADMIN, APP_ADMIN])('stops %s reading the season-scoped token', async uid => {
		await seedToken();

		await assertFails(getDoc(doc(authed(uid, uid === APP_ADMIN ? { admin: true } : undefined), tokenDoc())));
	});

	it.each([MEMBER, SEASON_ADMIN, APP_ADMIN])('stops %s writing the season-scoped token', async uid => {
		await assertFails(
			setDoc(doc(authed(uid, uid === APP_ADMIN ? { admin: true } : undefined), tokenDoc()), {
				token: 'forged',
				createdAt: '2026-08-01T00:00:00.000Z',
				createdBy: uid,
			})
		);
	});

	it.each([MEMBER, SEASON_ADMIN, APP_ADMIN])('stops %s reading the reverse index', async uid => {
		await seedToken();

		await assertFails(getDoc(doc(authed(uid, uid === APP_ADMIN ? { admin: true } : undefined), feedDoc())));
	});

	it.each([MEMBER, SEASON_ADMIN, APP_ADMIN])('stops %s writing the reverse index', async uid => {
		await assertFails(
			setDoc(doc(authed(uid, uid === APP_ADMIN ? { admin: true } : undefined), feedDoc()), { seasonId: SEASON })
		);
	});
});

describe('responses', () => {
	it('lets a member say they are in', async () => {
		await assertSucceeds(setDoc(doc(authed(MEMBER), responseDoc(MEMBER)), aResponse(MEMBER, 'member')));
	});

	it('lets a non-member respond as an extra', async () => {
		await assertSucceeds(setDoc(doc(authed(EXTRA), responseDoc(EXTRA)), aResponse(EXTRA, 'extra')));
	});

	it('stops a non-member claiming member ranking', async () => {
		await assertFails(setDoc(doc(authed(EXTRA), responseDoc(EXTRA)), aResponse(EXTRA, 'member')));
	});

	it('stops a member downgrading themselves to an extra', async () => {
		await assertFails(setDoc(doc(authed(MEMBER), responseDoc(MEMBER)), aResponse(MEMBER, 'extra')));
	});

	it('stops anyone answering on someone else’s behalf', async () => {
		await assertFails(setDoc(doc(authed(EXTRA), responseDoc(MEMBER)), aResponse(MEMBER, 'member')));
	});

	it('rejects a status outside in/out', async () => {
		await assertFails(
			setDoc(doc(authed(MEMBER), responseDoc(MEMBER)), aResponse(MEMBER, 'member', { status: 'maybe' }))
		);
	});

	it('stops an extra confirming their own spot', async () => {
		await assertFails(
			setDoc(doc(authed(EXTRA), responseDoc(EXTRA)), aResponse(EXTRA, 'extra', { confirmOverride: true }))
		);
	});

	it('lets a player change their mind', async () => {
		await setDoc(doc(authed(MEMBER), responseDoc(MEMBER)), aResponse(MEMBER, 'member'));

		await assertSucceeds(updateDoc(doc(authed(MEMBER), responseDoc(MEMBER)), { status: 'out' }));
	});

	// `respondedAt` decides which extras a season admin sees first, so it has to
	// be as unforgeable as `role` is.
	it('stops an extra backdating respondedAt to jump the queue', async () => {
		await setDoc(doc(authed(EXTRA), responseDoc(EXTRA)), aResponse(EXTRA, 'extra'));

		await assertFails(
			updateDoc(doc(authed(EXTRA), responseDoc(EXTRA)), { respondedAt: '1999-01-01T00:00:00.000Z' })
		);
	});

	it('stops respondedAt moving even on an otherwise valid answer change', async () => {
		await setDoc(doc(authed(EXTRA), responseDoc(EXTRA)), aResponse(EXTRA, 'extra'));

		await assertFails(
			setDoc(
				doc(authed(EXTRA), responseDoc(EXTRA)),
				aResponse(EXTRA, 'extra', { status: 'out', respondedAt: '1999-01-01T00:00:00.000Z' })
			)
		);
	});

	it('lets a player change their mind while respondedAt stays put', async () => {
		await setDoc(doc(authed(EXTRA), responseDoc(EXTRA)), aResponse(EXTRA, 'extra'));

		await assertSucceeds(
			setDoc(
				doc(authed(EXTRA), responseDoc(EXTRA)),
				aResponse(EXTRA, 'extra', { status: 'out', updatedAt: '2026-08-31T10:00:00.000Z' })
			)
		);
	});

	it('stops a player smuggling in confirmOverride on update', async () => {
		await setDoc(doc(authed(EXTRA), responseDoc(EXTRA)), aResponse(EXTRA, 'extra'));

		await assertFails(updateDoc(doc(authed(EXTRA), responseDoc(EXTRA)), { confirmOverride: true }));
	});

	it('lets a season admin drop an extra', async () => {
		await setDoc(doc(authed(EXTRA), responseDoc(EXTRA)), aResponse(EXTRA, 'extra'));

		await assertSucceeds(updateDoc(doc(authed(SEASON_ADMIN), responseDoc(EXTRA)), { confirmOverride: false }));
	});

	it('lets a player withdraw entirely, back to no response', async () => {
		await setDoc(doc(authed(MEMBER), responseDoc(MEMBER)), aResponse(MEMBER, 'member'));

		await assertSucceeds(deleteDoc(doc(authed(MEMBER), responseDoc(MEMBER))));
	});

	it('stops a player deleting someone else’s response', async () => {
		await setDoc(doc(authed(MEMBER), responseDoc(MEMBER)), aResponse(MEMBER, 'member'));

		await assertFails(deleteDoc(doc(authed(EXTRA), responseDoc(MEMBER))));
	});

	// Any signed-in person can create one of these against any game, which makes
	// it the widest-open write in the app.
	it('rejects a note long enough to be a payload rather than a note', async () => {
		await assertFails(
			setDoc(doc(authed(EXTRA), responseDoc(EXTRA)), aResponse(EXTRA, 'extra', { note: 'x'.repeat(281) }))
		);
	});

	it('accepts a note somebody would actually write', async () => {
		await assertSucceeds(
			setDoc(
				doc(authed(EXTRA), responseDoc(EXTRA)),
				aResponse(EXTRA, 'extra', { note: 'Back by 7, save me a spot' })
			)
		);
	});

	it('rejects fields the response schema does not have', async () => {
		await assertFails(
			setDoc(doc(authed(EXTRA), responseDoc(EXTRA)), aResponse(EXTRA, 'extra', { junk: 'y'.repeat(50_000) }))
		);
	});

	it('lets everyone see who is playing', async () => {
		await setDoc(doc(authed(MEMBER), responseDoc(MEMBER)), aResponse(MEMBER, 'member'));

		await assertSucceeds(getDoc(doc(authed(EXTRA), responseDoc(MEMBER))));
	});

	it('stops responses to a cancelled game', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await updateDoc(doc(context.firestore(), gameDoc()), { status: 'cancelled' });
		});

		await assertFails(setDoc(doc(authed(MEMBER), responseDoc(MEMBER)), aResponse(MEMBER, 'member')));
	});
});

// The UI disables the In/Out buttons past the deadline, but that is cosmetic on
// its own — a direct SDK call, or a tab left open since before it passed, would
// otherwise still land. These lock it down for real.
describe('the response deadline', () => {
	it('stops a member answering once the deadline has passed', async () => {
		await assertFails(setDoc(doc(authed(MEMBER), lockedResponseDoc(MEMBER)), aResponse(MEMBER, 'member')));
	});

	it('stops an extra answering once the deadline has passed', async () => {
		await assertFails(setDoc(doc(authed(EXTRA), lockedResponseDoc(EXTRA)), aResponse(EXTRA, 'extra')));
	});

	it('stops a member changing their mind once the deadline has passed', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), lockedResponseDoc(MEMBER)), aResponse(MEMBER, 'member'));
		});

		await assertFails(updateDoc(doc(authed(MEMBER), lockedResponseDoc(MEMBER)), { status: 'out' }));
	});

	it('stops a member withdrawing once the deadline has passed', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), lockedResponseDoc(MEMBER)), aResponse(MEMBER, 'member'));
		});

		await assertFails(deleteDoc(doc(authed(MEMBER), lockedResponseDoc(MEMBER))));
	});

	// Somebody drops out an hour before kickoff and rings the organiser. That has
	// to remain fixable, which is what the admin `write` rule is for.
	it('still lets a season admin fix a response after the deadline', async () => {
		await assertSucceeds(setDoc(doc(authed(SEASON_ADMIN), lockedResponseDoc(MEMBER)), aResponse(MEMBER, 'member')));
	});

	it('leaves a game answerable while it is still outside the deadline', async () => {
		await assertSucceeds(setDoc(doc(authed(MEMBER), responseDoc(MEMBER)), aResponse(MEMBER, 'member')));
	});

	// Until the backfill script has run, older games carry no kickoffMillis and
	// must keep behaving exactly as they did before the deadline existed.
	it('leaves a game with no kickoffMillis answerable', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			const { kickoffMillis, ...withoutMillis } = aGame(
				new Date(Date.now() + 3_600_000).toISOString(),
				new Date(Date.now() + 9_000_000).toISOString()
			);
			void kickoffMillis;
			await setDoc(doc(context.firestore(), `seasons/${SEASON}/games/legacy`), withoutMillis);
		});

		await assertSucceeds(
			setDoc(
				doc(authed(MEMBER), `seasons/${SEASON}/games/legacy/responses/${MEMBER}`),
				aResponse(MEMBER, 'member')
			)
		);
	});
});

describe('the man-of-the-match vote', () => {
	const voteDoc = (uid: string) => `seasons/${SEASON}/games/${GAME}/motmVotes/${uid}`;

	const aVote = (uid: string, votedFor: string, extras: Record<string, unknown> = {}) => ({
		uid,
		votedFor,
		votedAt: '2026-09-02T09:00:00.000Z',
		...extras,
	});

	/**
	 * A played game: the lineup up, and the vote open for another hour.
	 *
	 * `APP_ADMIN` is deliberately left out of it — they are this suite's person
	 * who wasn't there, and the badge buys them nothing here.
	 */
	const openTheVote = async (until: number = Date.now() + 3_600_000) => {
		await testEnv.withSecurityRulesDisabled(async context => {
			const db = context.firestore();

			await setDoc(doc(db, `seasons/${SEASON}/games/${GAME}/tournament/teams`), {
				teams: [
					{ index: 0, uids: [MEMBER, SEASON_ADMIN] },
					{ index: 1, uids: [OTHER_MEMBER, EXTRA] },
				],
				elos: { [MEMBER]: 1000, [OTHER_MEMBER]: 1000, [SEASON_ADMIN]: 1000, [EXTRA]: 1000 },
				seed: 1,
				settings: { randomness: 0.3, repeatPenalty: 0.4, repeatLookback: 4, matchMinutes: 5 },
				generation: 1,
				builtAt: '2026-08-30T10:00:00.000Z',
			});

			await updateDoc(doc(db, gameDoc()), { motmVotingUntilMillis: until });
		});
	};

	it('lets somebody who played vote for somebody who played', async () => {
		await openTheVote();

		await assertSucceeds(setDoc(doc(authed(MEMBER), voteDoc(MEMBER)), aVote(MEMBER, OTHER_MEMBER)));
	});

	// The team sheet is the only record of who was on the pitch, and unlike a
	// response it is function-written and unforgeable.
	it('refuses a vote from somebody who was not in the lineup', async () => {
		await openTheVote();

		await assertFails(
			setDoc(doc(authed(APP_ADMIN, { admin: true }), voteDoc(APP_ADMIN)), aVote(APP_ADMIN, MEMBER))
		);
	});

	it('refuses a vote for somebody who was not in the lineup', async () => {
		await openTheVote();

		await assertFails(setDoc(doc(authed(MEMBER), voteDoc(MEMBER)), aVote(MEMBER, APP_ADMIN)));
	});

	// Deliberately allowed. A rule against it is one more thing to go wrong for
	// the player who genuinely was the best one out there, and the group can be
	// trusted to have an opinion about somebody who does it every week.
	it('lets somebody vote for themselves', async () => {
		await openTheVote();

		await assertSucceeds(setDoc(doc(authed(MEMBER), voteDoc(MEMBER)), aVote(MEMBER, MEMBER)));
	});

	it('refuses to let anyone vote on somebody else’s behalf', async () => {
		await openTheVote();

		await assertFails(setDoc(doc(authed(MEMBER), voteDoc(OTHER_MEMBER)), aVote(OTHER_MEMBER, MEMBER)));
	});

	// The one place privacy here is load-bearing rather than tidy: a running
	// count visible while the vote is open turns an early lead into a bandwagon.
	// The totals are published on `tournament/motm` once the sweep counts them.
	it('keeps a vote private to the voter, admins of every kind included', async () => {
		await openTheVote();
		await setDoc(doc(authed(MEMBER), voteDoc(MEMBER)), aVote(MEMBER, OTHER_MEMBER));

		await assertSucceeds(getDoc(doc(authed(MEMBER), voteDoc(MEMBER))));
		await assertFails(getDoc(doc(authed(OTHER_MEMBER), voteDoc(MEMBER))));
		await assertFails(getDoc(doc(authed(SEASON_ADMIN), voteDoc(MEMBER))));
		await assertFails(getDoc(doc(authed(APP_ADMIN, { admin: true }), voteDoc(MEMBER))));
	});

	// The shape a bandwagon would actually be built from.
	it('refuses to list who has voted for whom', async () => {
		await openTheVote();

		await assertFails(getDocs(collection(authed(MEMBER), `seasons/${SEASON}/games/${GAME}/motmVotes`)));
		await assertFails(
			getDocs(collection(authed(APP_ADMIN, { admin: true }), `seasons/${SEASON}/games/${GAME}/motmVotes`))
		);
	});

	it('lets a voter change their mind, and take it back, while it is open', async () => {
		await openTheVote();
		await setDoc(doc(authed(MEMBER), voteDoc(MEMBER)), aVote(MEMBER, OTHER_MEMBER));

		await assertSucceeds(setDoc(doc(authed(MEMBER), voteDoc(MEMBER)), aVote(MEMBER, EXTRA)));
		await assertSucceeds(deleteDoc(doc(authed(MEMBER), voteDoc(MEMBER))));
	});

	// The window is what the sweep counted against, so a late vote would change
	// an answer the ladder has already been replayed against.
	it('refuses a vote once the window has passed', async () => {
		await openTheVote(Date.now() - 1_000);

		await assertFails(setDoc(doc(authed(MEMBER), voteDoc(MEMBER)), aVote(MEMBER, OTHER_MEMBER)));
	});

	it('refuses to let a counted vote be withdrawn afterwards', async () => {
		await openTheVote();
		await setDoc(doc(authed(MEMBER), voteDoc(MEMBER)), aVote(MEMBER, OTHER_MEMBER));

		await testEnv.withSecurityRulesDisabled(async context => {
			await updateDoc(doc(context.firestore(), gameDoc()), { motmVotingUntilMillis: deleteField() });
		});

		await assertFails(deleteDoc(doc(authed(MEMBER), voteDoc(MEMBER))));
	});

	// No window at all is the state of every game nobody has confirmed yet, as
	// well as every game already counted.
	it('refuses a vote on a game that has not been confirmed', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), `seasons/${SEASON}/games/${GAME}/tournament/teams`), {
				teams: [
					{ index: 0, uids: [MEMBER, SEASON_ADMIN] },
					{ index: 1, uids: [OTHER_MEMBER, EXTRA] },
				],
				elos: {},
				seed: 1,
				settings: { randomness: 0.3, repeatPenalty: 0.4, repeatLookback: 4, matchMinutes: 5 },
				generation: 1,
				builtAt: '2026-08-30T10:00:00.000Z',
			});
		});

		await assertFails(setDoc(doc(authed(MEMBER), voteDoc(MEMBER)), aVote(MEMBER, OTHER_MEMBER)));
	});

	// Held open, an admin could keep collecting votes after the ladder had been
	// replayed against the ones already counted.
	it('refuses to let an admin move the deadline', async () => {
		await openTheVote();

		await assertFails(
			updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), { motmVotingUntilMillis: Date.now() + 86_400_000 })
		);
		await assertFails(updateDoc(doc(authed(SEASON_ADMIN), gameDoc()), { motmVotingUntilMillis: deleteField() }));
	});

	// A game is created with no vote open on it, the same way it is created with
	// no reminders sent.
	it('refuses a game created with the vote already open', async () => {
		await assertFails(
			setDoc(doc(authed(SEASON_ADMIN), `seasons/${SEASON}/games/game-new`), {
				...aGame('2026-10-01T17:00:00.000Z', '2026-10-01T18:30:00.000Z'),
				motmVotingUntilMillis: Date.now() + 86_400_000,
			})
		);
	});

	it('bounds what can be written into one', async () => {
		await openTheVote();

		await assertFails(
			setDoc(doc(authed(MEMBER), voteDoc(MEMBER)), aVote(MEMBER, OTHER_MEMBER, { payload: 'x'.repeat(500) }))
		);
		await assertFails(setDoc(doc(authed(MEMBER), voteDoc(MEMBER)), aVote(MEMBER, OTHER_MEMBER, { votedAt: 1 })));
	});

	it('refuses a uid field that disagrees with the document id', async () => {
		await openTheVote();

		await assertFails(setDoc(doc(authed(MEMBER), voteDoc(MEMBER)), aVote(OTHER_MEMBER, EXTRA)));
	});
});

describe('watchers', () => {
	const watcherDoc = (uid: string) => `seasons/${SEASON}/games/${GAME}/watchers/${uid}`;

	const aWatcher = (uid: string, extras: Record<string, unknown> = {}) => ({
		uid,
		createdAt: '2026-08-30T09:00:00.000Z',
		...extras,
	});

	// Anybody signed in can follow a game, on the same reasoning as responding
	// to one: extras have to be able to keep an eye on a game they might fill.
	it('lets anyone signed in follow a game, and stop', async () => {
		await assertSucceeds(setDoc(doc(authed(EXTRA), watcherDoc(EXTRA)), aWatcher(EXTRA)));
		await assertSucceeds(deleteDoc(doc(authed(EXTRA), watcherDoc(EXTRA))));
	});

	it('refuses to let anyone follow on somebody else’s behalf', async () => {
		await assertFails(setDoc(doc(authed(MEMBER), watcherDoc(OTHER_MEMBER)), aWatcher(OTHER_MEMBER)));
	});

	// Not because the document grants anything — it doesn't — but because
	// nothing needs it, and a game the whole group can read has no business
	// publishing who is quietly keeping an eye on it.
	//
	// The app admin is the one that has to keep failing now that `/s/…/g/…`
	// shows them exactly this list: the answer arrives through the
	// `getGameWatchers` callable, reading with the Admin SDK. Relaxing the rule
	// would have been the shortcut, and it would have published the same list to
	// every screen and every script holding a signed-in token.
	it('keeps who is following private to them, admins of every kind included', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), watcherDoc(MEMBER)), aWatcher(MEMBER));
		});

		await assertSucceeds(getDoc(doc(authed(MEMBER), watcherDoc(MEMBER))));
		await assertFails(getDoc(doc(authed(OTHER_MEMBER), watcherDoc(MEMBER))));
		await assertFails(getDoc(doc(authed(SEASON_ADMIN), watcherDoc(MEMBER))));
		await assertFails(getDoc(doc(authed(APP_ADMIN, { admin: true }), watcherDoc(MEMBER))));
	});

	// The collection, not one document — the shape an admin screen would reach
	// for first, and the one a rule granting per-document reads would still have
	// to refuse.
	it('refuses to list who is following, app admin included', async () => {
		await assertFails(getDocs(collection(authed(SEASON_ADMIN), `seasons/${SEASON}/games/${GAME}/watchers`)));
		await assertFails(
			getDocs(collection(authed(APP_ADMIN, { admin: true }), `seasons/${SEASON}/games/${GAME}/watchers`))
		);
	});

	it('refuses to let one be unfollowed by anyone but its owner', async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), watcherDoc(MEMBER)), aWatcher(MEMBER));
		});

		await assertFails(deleteDoc(doc(authed(OTHER_MEMBER), watcherDoc(MEMBER))));
		await assertSucceeds(deleteDoc(doc(authed(MEMBER), watcherDoc(MEMBER))));
	});

	// Nobody but the owner reads this, so the bound is about what can be parked
	// in the database rather than about who would see it.
	it('bounds what can be written into one', async () => {
		await assertFails(
			setDoc(doc(authed(MEMBER), watcherDoc(MEMBER)), aWatcher(MEMBER, { payload: 'x'.repeat(500) }))
		);
		await assertFails(setDoc(doc(authed(MEMBER), watcherDoc(MEMBER)), aWatcher(MEMBER, { createdAt: 12345 })));
	});

	// The id is what `getWatcherUids` reads, so a mismatched field would put a
	// name to a notification that belongs to somebody else.
	it('refuses a uid field that disagrees with the document id', async () => {
		await assertFails(setDoc(doc(authed(MEMBER), watcherDoc(MEMBER)), aWatcher(OTHER_MEMBER)));
	});

	// Following is about the game, not about answering it — you might be
	// watching precisely because you haven't decided yet, or because the
	// deadline has passed and you want to know who dropped out.
	it('does not need a response, or an open game', async () => {
		await assertSucceeds(
			setDoc(doc(authed(MEMBER), `seasons/${SEASON}/games/${LOCKED_GAME}/watchers/${MEMBER}`), aWatcher(MEMBER))
		);
	});
});

describe('kit', () => {
	const kitDoc = (itemId: string) => `seasons/${SEASON}/kit/${itemId}`;

	const anItem = (updatedBy: string, extras: Record<string, unknown> = {}) => ({
		name: 'Match ball',
		kind: 'ball',
		holderUid: MEMBER,
		updatedBy,
		updatedAt: '2026-08-30T09:00:00.000Z',
		...extras,
	});

	const seedItem = async (extras: Record<string, unknown> = {}) => {
		await testEnv.withSecurityRulesDisabled(async context => {
			await setDoc(doc(context.firestore(), kitDoc('ball-1')), anItem(SEASON_ADMIN, extras));
		});
	};

	// A team sheet nobody can see is no use, and neither is a register: an extra
	// turning up for one game still wants to know whether to bring a ball.
	it('lets anyone signed in read the register', async () => {
		await seedItem();

		await assertSucceeds(getDoc(doc(authed(EXTRA), kitDoc('ball-1'))));
		await assertSucceeds(getDocs(collection(authed(EXTRA), `seasons/${SEASON}/kit`)));
	});

	it('lets a season admin add and remove items', async () => {
		await assertSucceeds(setDoc(doc(authed(SEASON_ADMIN), kitDoc('vests-1')), anItem(SEASON_ADMIN)));
		await assertSucceeds(deleteDoc(doc(authed(SEASON_ADMIN), kitDoc('vests-1'))));
	});

	it('refuses to let a member add or remove one', async () => {
		await assertFails(setDoc(doc(authed(MEMBER), kitDoc('vests-1')), anItem(MEMBER)));

		await seedItem();
		await assertFails(deleteDoc(doc(authed(MEMBER), kitDoc('ball-1'))));
	});

	// The whole feature: a handover happens at the pitch between two people, and
	// routing it through an admin means it never gets recorded at all.
	it('lets any member hand an item to any other member', async () => {
		await seedItem();

		await assertSucceeds(
			updateDoc(doc(authed(OTHER_MEMBER), kitDoc('ball-1')), {
				holderUid: OTHER_MEMBER,
				updatedBy: OTHER_MEMBER,
				updatedAt: '2026-08-31T09:00:00.000Z',
			})
		);
	});

	it('refuses a handover from somebody outside the squad', async () => {
		await seedItem();

		await assertFails(
			updateDoc(doc(authed(EXTRA), kitDoc('ball-1')), {
				holderUid: MEMBER,
				updatedBy: EXTRA,
				updatedAt: '2026-08-31T09:00:00.000Z',
			})
		);
	});

	// An item is always with somebody who will still be around next week.
	// Extras come and go by definition.
	it('refuses to hand an item to somebody outside the squad', async () => {
		await seedItem();

		await assertFails(
			updateDoc(doc(authed(MEMBER), kitDoc('ball-1')), {
				holderUid: EXTRA,
				updatedBy: MEMBER,
				updatedAt: '2026-08-31T09:00:00.000Z',
			})
		);

		await assertFails(
			setDoc(doc(authed(SEASON_ADMIN), kitDoc('vests-1')), anItem(SEASON_ADMIN, { holderUid: EXTRA }))
		);
	});

	// The kind is what decides whether a game gets warned about a missing ball.
	// A member who could re-kind the vests as `other` could switch that warning
	// off for the whole squad, which is a different power from carrying a bag
	// home — so a member's write is a handover and nothing else.
	it('refuses to let a member rename an item or change its kind', async () => {
		await seedItem();

		await assertFails(
			updateDoc(doc(authed(MEMBER), kitDoc('ball-1')), {
				name: 'Flat ball',
				updatedBy: MEMBER,
				updatedAt: '2026-08-31T09:00:00.000Z',
			})
		);

		await assertFails(
			updateDoc(doc(authed(MEMBER), kitDoc('ball-1')), {
				kind: 'other',
				updatedBy: MEMBER,
				updatedAt: '2026-08-31T09:00:00.000Z',
			})
		);
	});

	it('lets a season admin rename one and change its kind', async () => {
		await seedItem();

		await assertSucceeds(
			updateDoc(doc(authed(SEASON_ADMIN), kitDoc('ball-1')), {
				name: 'Spare ball',
				kind: 'other',
				updatedBy: SEASON_ADMIN,
				updatedAt: '2026-08-31T09:00:00.000Z',
			})
		);
	});

	// The squad check is on handovers, not on the document. Enforced on every
	// write it froze exactly the item the register is complaining about: an
	// admin couldn't correct the name of something stranded until they had
	// invented a holder for it.
	it('lets an item that is already stranded be renamed without inventing a holder', async () => {
		await seedItem({ holderUid: 'left-the-squad' });

		await assertSucceeds(
			updateDoc(doc(authed(SEASON_ADMIN), kitDoc('ball-1')), {
				name: 'Old blue ball',
				updatedBy: SEASON_ADMIN,
				updatedAt: '2026-08-31T09:00:00.000Z',
			})
		);

		// And still can't be handed anywhere but the squad.
		await assertFails(
			updateDoc(doc(authed(SEASON_ADMIN), kitDoc('ball-1')), {
				holderUid: EXTRA,
				updatedBy: SEASON_ADMIN,
				updatedAt: '2026-08-31T09:00:00.000Z',
			})
		);
	});

	// Anybody in the squad can move an item, so a wrong handover needs a face on
	// it — the same reason the scoreboard pins `updatedBy` to the caller.
	it('refuses a handover signed as somebody else', async () => {
		await seedItem();

		await assertFails(
			updateDoc(doc(authed(OTHER_MEMBER), kitDoc('ball-1')), {
				holderUid: OTHER_MEMBER,
				updatedBy: MEMBER,
				updatedAt: '2026-08-31T09:00:00.000Z',
			})
		);
	});

	it('bounds what can be parked on an item', async () => {
		await assertFails(setDoc(doc(authed(SEASON_ADMIN), kitDoc('x')), anItem(SEASON_ADMIN, { name: '' })));
		await assertFails(
			setDoc(doc(authed(SEASON_ADMIN), kitDoc('x')), anItem(SEASON_ADMIN, { name: 'x'.repeat(61) }))
		);
		await assertFails(setDoc(doc(authed(SEASON_ADMIN), kitDoc('x')), anItem(SEASON_ADMIN, { kind: 'trophy' })));
		await assertFails(
			setDoc(doc(authed(SEASON_ADMIN), kitDoc('x')), anItem(SEASON_ADMIN, { payload: 'x'.repeat(200) }))
		);
	});

	// An app admin runs every season whether or not they play in one.
	it('lets an app admin who is not in the squad manage the register', async () => {
		await assertSucceeds(setDoc(doc(authed(APP_ADMIN, { admin: true }), kitDoc('vests-1')), anItem(APP_ADMIN)));
	});
});

describe('collection-group reads', () => {
	// The games list loads "my answer to every game" in a single listener, which
	// needs a recursive-wildcard read rule on top of the nested one.
	it('lets a user query their own responses across every game', async () => {
		await setDoc(doc(authed(MEMBER), responseDoc(MEMBER)), aResponse(MEMBER, 'member'));

		const mine = query(collectionGroup(authed(MEMBER), 'responses'), where('uid', '==', MEMBER));

		const snapshot = await assertSucceeds(getDocs(mine));
		expect(snapshot.size).toBe(1);
	});

	it('blocks the same query when signed out', async () => {
		const db = testEnv.unauthenticatedContext().firestore();

		await assertFails(getDocs(query(collectionGroup(db, 'responses'), where('uid', '==', MEMBER))));
	});
});

describe('everything else', () => {
	it('denies collections the rules never mention', async () => {
		await assertFails(getDoc(doc(authed(MEMBER), 'secrets/whatever')));
		await assertFails(setDoc(doc(authed(MEMBER), 'secrets/whatever'), { a: 1 }));
	});
});
