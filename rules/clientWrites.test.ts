import { readFileSync } from 'fs';
import { join } from 'path';
import type { Firestore } from 'firebase/firestore';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

/**
 * The app's own write layer, driven through the real security rules.
 *
 * There are four independent copies of this database's shape in the repo:
 * `frontend/lib/db/paths.ts`, `firestore.rules`, the path helpers in
 * firestore.test.ts, and the ones in backend/tests/helpers.ts. Every suite
 * builds its own strings, so nothing notices when two of them stop agreeing,
 * firestore.test.ts can prove `motmVotes/{uid}` is locked down perfectly while
 * the client writes somewhere else entirely, and both stay green.
 *
 * These close that gap from the other end. Rather than asserting a hand-written
 * path is refused, they call the function the app actually calls and check the
 * rules accept it, so the path, the document shape and the rule that guards it
 * are asserted together, by the code that ships.
 *
 * `getDb` is the only seam needed: every module under `lib/db` reaches Firestore
 * through `paths.ts`, and `paths.ts` reaches it through `getDb`. Pointing that
 * at a `@firebase/rules-unit-testing` context is enough to run the real client
 * code as a real signed-in person.
 */

const PROJECT_ID = 'demo-frescati';
const SEASON = 'season-1';
const GAME = 'game-1';

const APP_ADMIN = 'app-admin';
const SEASON_ADMIN = 'season-admin';
const MEMBER = 'member-1';
const OTHER_MEMBER = 'member-2';
const EXTRA = 'extra-1';

let testEnv: RulesTestEnvironment;

/** Swapped per test by `as`, and read by the mocked `getDb` below. */
let currentDb: Firestore;

jest.mock('../frontend/lib/firebaseClient', () => ({ getDb: () => currentDb }));

import { clearResponse, setConfirmOverride, setResponse } from '../frontend/lib/db/responses';
import { addKitItem, deleteKitItem, renameKitItem, transferKitItem } from '../frontend/lib/db/kit';
import { unwatchGame, watchGame } from '../frontend/lib/db/watchers';
import { clearMotmVote, setMotmVote } from '../frontend/lib/db/motm';
import { setMatchScore } from '../frontend/lib/db/tournament';
import { addDue, addExpense, deleteDue, deleteExpense, raiseDues, setDueStatus } from '../frontend/lib/db/finances';

/** Run the next client call as this person. */
const as = (uid: string, claims?: Record<string, unknown>): void => {
	currentDb = testEnv.authenticatedContext(uid, claims).firestore() as unknown as Firestore;
};

const kickoff = '2026-09-01T17:00:00.000Z';

beforeAll(async () => {
	testEnv = await initializeTestEnvironment({
		projectId: PROJECT_ID,
		firestore: { rules: readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8') },
	});
});

afterAll(() => testEnv.cleanup());

beforeEach(async () => {
	await testEnv.clearFirestore();

	await testEnv.withSecurityRulesDisabled(async context => {
		const db = context.firestore();

		await setDoc(doc(db, `seasons/${SEASON}`), {
			name: 'Autumn 2026',
			status: 'active',
			memberUids: [MEMBER, OTHER_MEMBER, SEASON_ADMIN],
			adminUids: [SEASON_ADMIN],
			minPlayers: 10,
			responseDeadlineHours: 24,
			slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'Europe/Stockholm' },
			createdAt: '2026-08-01T00:00:00.000Z',
			createdBy: APP_ADMIN,
		});

		await setDoc(doc(db, `seasons/${SEASON}/games/${GAME}`), {
			seasonId: SEASON,
			kickoff,
			// Rules cannot parse ISO 8601, so the deadline is enforced against this.
			kickoffMillis: Date.parse(kickoff),
			endsAt: '2026-09-01T18:30:00.000Z',
			status: 'scheduled',
			isOneOff: false,
			counts: { membersIn: 0, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 0 },
			atRisk: true,
			createdAt: '2026-08-01T00:00:00.000Z',
			createdBy: SEASON_ADMIN,
		});
	});
});

describe('answering a game', () => {
	it('lets a member say they are in', async () => {
		as(MEMBER);

		await assertSucceeds(setResponse(SEASON, GAME, MEMBER, 'in', 'member'));
	});

	it('lets somebody who is not on the roster answer as an extra', async () => {
		// Deliberate: extras have to be able to find a game and put their hand up.
		as(EXTRA);

		await assertSucceeds(setResponse(SEASON, GAME, EXTRA, 'in', 'extra'));
	});

	it('refuses an extra claiming to be a member', async () => {
		// `role` is snapshotted on the document and re-checked against real
		// membership at write time, which is the only thing stopping a client
		// promoting itself above the confirmation queue.
		as(EXTRA);

		await assertFails(setResponse(SEASON, GAME, EXTRA, 'in', 'member'));
	});

	it('refuses a member answering for somebody else', async () => {
		as(MEMBER);

		await assertFails(setResponse(SEASON, GAME, OTHER_MEMBER, 'in', 'member'));
	});

	it('lets somebody take their answer back, which is the third state', async () => {
		as(MEMBER);
		await setResponse(SEASON, GAME, MEMBER, 'in', 'member');

		await assertSucceeds(clearResponse(SEASON, GAME, MEMBER));

		expect((await getDoc(doc(currentDb, `seasons/${SEASON}/games/${GAME}/responses/${MEMBER}`))).exists()).toBe(
			false
		);
	});

	it('keeps the original signup time when somebody changes their mind', async () => {
		// Frozen by the rules once written, so an extra cannot backdate their way
		// up the queue, which is what `setResponse` reading the document back is
		// for when the caller has not got it yet.
		as(EXTRA);
		await setResponse(SEASON, GAME, EXTRA, 'in', 'extra');
		const first = (await getDoc(doc(currentDb, `seasons/${SEASON}/games/${GAME}/responses/${EXTRA}`))).data();

		await assertSucceeds(setResponse(SEASON, GAME, EXTRA, 'out', 'extra'));

		const second = (await getDoc(doc(currentDb, `seasons/${SEASON}/games/${GAME}/responses/${EXTRA}`))).data();
		expect(second?.respondedAt).toBe(first?.respondedAt);
	});
});

describe('confirming an extra', () => {
	beforeEach(async () => {
		as(EXTRA);
		await setResponse(SEASON, GAME, EXTRA, 'in', 'extra');
	});

	it('is allowed to a season admin', async () => {
		as(SEASON_ADMIN);

		await assertSucceeds(setConfirmOverride(SEASON, GAME, EXTRA, true));
	});

	it('is refused to an ordinary member', async () => {
		as(MEMBER);

		await assertFails(setConfirmOverride(SEASON, GAME, EXTRA, true));
	});

	it('is refused to the extra themselves', async () => {
		// Otherwise the confirmation queue is advisory.
		as(EXTRA);

		await assertFails(setConfirmOverride(SEASON, GAME, EXTRA, true));
	});
});

describe('the kit register', () => {
	/** Added by an admin, since that is the only way one gets there. */
	const anItem = async (): Promise<string> => {
		as(SEASON_ADMIN);

		return addKitItem(SEASON, { name: 'Match ball', kind: 'ball', holderUid: MEMBER }, SEASON_ADMIN);
	};

	it('lets a season admin add an item', async () => {
		await expect(anItem()).resolves.toEqual(expect.any(String));
	});

	it('refuses a member adding one', async () => {
		as(MEMBER);

		await assertFails(addKitItem(SEASON, { name: 'Vests', kind: 'vests', holderUid: MEMBER }, MEMBER));
	});

	it('lets any member hand any item to any other member', async () => {
		// A handover happens at a pitch between two people; routing it through an
		// admin means it never gets recorded at all.
		const itemId = await anItem();
		as(OTHER_MEMBER);

		await assertSucceeds(transferKitItem(SEASON, itemId, OTHER_MEMBER, OTHER_MEMBER));
	});

	it('refuses a member renaming one', async () => {
		// The rule is a diff: a member's write may touch `holderUid`, `updatedBy`
		// and `updatedAt` and nothing else. A member who could re-kind the vests
		// as `other` would silence that warning for the whole squad.
		const itemId = await anItem();
		as(MEMBER);

		await assertFails(renameKitItem(SEASON, itemId, 'The good ball', MEMBER));
	});

	it('lets a season admin rename one', async () => {
		const itemId = await anItem();
		as(SEASON_ADMIN);

		await assertSucceeds(renameKitItem(SEASON, itemId, 'The good ball', SEASON_ADMIN));
	});

	it('refuses a member deleting one', async () => {
		const itemId = await anItem();
		as(MEMBER);

		await assertFails(deleteKitItem(SEASON, itemId));
	});
});

describe('following a game', () => {
	it('lets somebody follow and unfollow their own', async () => {
		as(MEMBER);

		await assertSucceeds(watchGame(SEASON, GAME, MEMBER));
		await assertSucceeds(unwatchGame(SEASON, GAME, MEMBER));
	});

	it('refuses signing somebody else up to be notified', async () => {
		as(MEMBER);

		await assertFails(watchGame(SEASON, GAME, OTHER_MEMBER));
	});

	it('keeps the list unreadable, app admin included', async () => {
		as(MEMBER);
		await watchGame(SEASON, GAME, MEMBER);

		// The one screen that answers "who hears if I move kick-off" goes through
		// the `getGameWatchers` callable precisely because this stays shut.
		as(APP_ADMIN, { admin: true });
		await assertFails(getDoc(doc(currentDb, `seasons/${SEASON}/games/${GAME}/watchers/${MEMBER}`)));
	});
});

describe('the man-of-the-match vote', () => {
	beforeEach(async () => {
		await testEnv.withSecurityRulesDisabled(async context => {
			const db = context.firestore();

			await setDoc(doc(db, `seasons/${SEASON}/games/${GAME}/tournament/teams`), {
				teams: [
					{ index: 0, uids: [MEMBER] },
					{ index: 1, uids: [OTHER_MEMBER] },
				],
				elos: {},
				seed: 0,
				generation: 1,
				builtAt: '2026-08-01T00:00:00.000Z',
			});

			await setDoc(
				doc(db, `seasons/${SEASON}/games/${GAME}`),
				{ motmVotingUntilMillis: Date.now() + 3_600_000 },
				{ merge: true }
			);
		});
	});

	it('lets somebody in the lineup vote', async () => {
		as(MEMBER);

		await assertSucceeds(setMotmVote(SEASON, GAME, MEMBER, OTHER_MEMBER));
	});

	it('lets somebody vote for themselves, which is allowed on purpose', async () => {
		as(MEMBER);

		await assertSucceeds(setMotmVote(SEASON, GAME, MEMBER, MEMBER));
	});

	it('refuses a vote from somebody who did not play', async () => {
		as(EXTRA);

		await assertFails(setMotmVote(SEASON, GAME, EXTRA, MEMBER));
	});

	it('keeps a vote unreadable by anybody else, admins included', async () => {
		// Load-bearing rather than tidy: a running count visible while the vote
		// is open turns an early lead into a bandwagon.
		as(MEMBER);
		await setMotmVote(SEASON, GAME, MEMBER, OTHER_MEMBER);

		as(SEASON_ADMIN);
		await assertFails(getDoc(doc(currentDb, `seasons/${SEASON}/games/${GAME}/motmVotes/${MEMBER}`)));
	});

	it('lets somebody take their own vote back', async () => {
		as(MEMBER);
		await setMotmVote(SEASON, GAME, MEMBER, OTHER_MEMBER);

		await assertSucceeds(clearMotmVote(SEASON, GAME, MEMBER));
	});

	it("refuses deleting somebody else's vote", async () => {
		as(MEMBER);
		await setMotmVote(SEASON, GAME, MEMBER, OTHER_MEMBER);

		as(OTHER_MEMBER);
		await assertFails(clearMotmVote(SEASON, GAME, MEMBER));
	});
});

describe('the scoreboard', () => {
	beforeEach(async () => {
		as(MEMBER);
		await setResponse(SEASON, GAME, MEMBER, 'in', 'member');
	});

	it('lets anybody holding a response on the game write a score', async () => {
		// The same bargain the kit register strikes: two people scoring the same
		// match write the same document, because the id is the fixture's place in
		// the running order.
		as(MEMBER);

		await assertSucceeds(setMatchScore(SEASON, GAME, { order: 0, teamA: 0, teamB: 1 }, 3, 2, MEMBER));
	});

	it('refuses a score from somebody who never answered', async () => {
		as(EXTRA);

		await assertFails(setMatchScore(SEASON, GAME, { order: 0, teamA: 0, teamB: 1 }, 9, 0, EXTRA));
	});
});

describe('the books', () => {
	/** What a sweep would raise for this season: one entry share, one game fee. */
	const planned = [
		{ id: `entry_${MEMBER}`, uid: MEMBER, kind: 'entry' as const, amount: 1736 },
		{ id: `game_${GAME}_${EXTRA}`, uid: EXTRA, kind: 'game' as const, amount: 70, gameId: GAME },
	];

	it('lets a season admin raise the missing charges', async () => {
		as(SEASON_ADMIN);

		await expect(raiseDues(SEASON, planned)).resolves.toBe(2);
	});

	it('refuses a member raising them', async () => {
		as(MEMBER);

		await assertFails(raiseDues(SEASON, planned));
	});

	// The idempotence the derived ids buy, driven through the real sweep. A second
	// pass writes the same documents with a fresh `createdAt`, which lands as an
	// update that touches keys an update may not, and the batch is refused whole
	// rather than resetting a charge somebody has already paid.
	it('refuses a second sweep over a charge that has been paid', async () => {
		as(SEASON_ADMIN);
		await raiseDues(SEASON, planned);
		await setDueStatus(SEASON, `entry_${MEMBER}`, 'paid', SEASON_ADMIN);

		await assertFails(raiseDues(SEASON, planned));
	});

	it('lets a season admin report a payment and take it back', async () => {
		as(SEASON_ADMIN);
		await raiseDues(SEASON, planned);

		await assertSucceeds(setDueStatus(SEASON, `game_${GAME}_${EXTRA}`, 'paid', SEASON_ADMIN));
		await assertSucceeds(setDueStatus(SEASON, `game_${GAME}_${EXTRA}`, 'owing', SEASON_ADMIN));
		await assertSucceeds(setDueStatus(SEASON, `game_${GAME}_${EXTRA}`, 'waived', SEASON_ADMIN));
	});

	// Reporting a payment is the admin's job, and the person who owes it reporting
	// their own would be marking their own homework.
	it('refuses a player settling their own charge', async () => {
		as(SEASON_ADMIN);
		await raiseDues(SEASON, planned);
		as(EXTRA);

		await assertFails(setDueStatus(SEASON, `game_${GAME}_${EXTRA}`, 'paid', EXTRA));
		await assertFails(deleteDue(SEASON, `game_${GAME}_${EXTRA}`));
	});

	// The case the sweep deliberately misses: a no-show an admin has decided
	// should pay anyway, with a generated id because no fact about the season
	// derives one.
	it('lets a season admin raise a charge by hand, with a note', async () => {
		as(SEASON_ADMIN);

		await expect(addDue(SEASON, { uid: EXTRA, amount: 70, note: 'Pulled out an hour before' })).resolves.toEqual(
			expect.any(String)
		);
	});

	it('lets a season admin record a purchase and delete it', async () => {
		as(SEASON_ADMIN);

		const id = await addExpense(
			SEASON,
			{ description: 'Match ball', amount: 450, date: '2026-09-02' },
			SEASON_ADMIN
		);

		expect(id).toEqual(expect.any(String));
		await assertSucceeds(deleteExpense(SEASON, id));
	});

	it('refuses a member spending the equipment money', async () => {
		as(MEMBER);

		await assertFails(addExpense(SEASON, { description: 'Match ball', amount: 450, date: '2026-09-02' }, MEMBER));
	});
});
