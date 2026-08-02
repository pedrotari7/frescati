import { readFileSync } from 'fs';
import { join } from 'path';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collectionGroup, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

const PROJECT_ID = 'demo-frescati';
const SEASON = 'season-1';
const GAME = 'game-1';

const APP_ADMIN = 'app-admin';
const SEASON_ADMIN = 'season-admin';
const MEMBER = 'member-1';
const OTHER_MEMBER = 'member-2';
const EXTRA = 'extra-1';

let testEnv: RulesTestEnvironment;

const authed = (uid: string, claims?: Record<string, unknown>) => testEnv.authenticatedContext(uid, claims).firestore();

const seasonDoc = () => `seasons/${SEASON}`;
const gameDoc = () => `seasons/${SEASON}/games/${GAME}`;
const responseDoc = (uid: string) => `seasons/${SEASON}/games/${GAME}/responses/${uid}`;

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

		await setDoc(doc(db, gameDoc()), {
			id: GAME,
			seasonId: SEASON,
			kickoff: '2026-09-01T17:00:00.000Z',
			endsAt: '2026-09-01T18:30:00.000Z',
			venue: { name: 'Frescati IP' },
			status: 'scheduled',
			isOneOff: false,
			counts: { membersIn: 0, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 0 },
			atRisk: true,
			createdAt: '2026-08-01T00:00:00.000Z',
			createdBy: SEASON_ADMIN,
		});
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

	it('keeps push tokens private to their owner', async () => {
		await assertSucceeds(
			setDoc(doc(authed(MEMBER), `users/${MEMBER}/pushTokens/tok`), { token: 'tok', createdAt: 'now' })
		);
		await assertFails(getDoc(doc(authed(EXTRA), `users/${MEMBER}/pushTokens/tok`)));
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
