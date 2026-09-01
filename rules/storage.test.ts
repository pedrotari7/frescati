import { readFileSync } from 'fs';
import { join } from 'path';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

/**
 * The bucket, which holds one thing: a season's receipts.
 *
 * These are a separate file from `firestore.test.ts` because they are a
 * separate ruleset, but they are not a separate question. `storage.rules`
 * decides who may read a file by reading the season document over in Firestore,
 * which is the only way a Storage rule can ask about a squad: it cannot run a
 * query, and `memberUids` and `adminUids` are both on one document it can spell
 * a path to. That cross-service read is the load-bearing part of the whole
 * feature and the part no unit test can reach, so it is driven here against
 * both emulators at once, exactly as it will run in production.
 *
 * The other half of why this file exists: an access rule the app relies on and
 * never exercises is a rule that quietly stops being true. Nothing in the
 * frontend suite can tell a bucket that refuses an extra from a bucket that
 * refuses nobody.
 */

const PROJECT_ID = 'demo-frescati';
const SEASON = 'season-1';

const APP_ADMIN = 'app-admin';
const SEASON_ADMIN = 'season-admin';
const MEMBER = 'member-1';
const EXTRA = 'extra-1';

/** What `shared/receipts.ts` derives, spelled out so a change to it fails here. */
const receiptPath = (receiptId: string) => `seasons/${SEASON}/receipts/${receiptId}`;

let testEnv: RulesTestEnvironment;

const storageOf = (uid: string, claims?: Record<string, unknown>) =>
	testEnv.authenticatedContext(uid, claims).storage();

const aPdf = () => new Uint8Array([0x25, 0x50, 0x44, 0x46]);

const pdf = { contentType: 'application/pdf' };

beforeAll(async () => {
	testEnv = await initializeTestEnvironment({
		projectId: PROJECT_ID,
		firestore: { rules: readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8') },
		storage: { rules: readFileSync(join(__dirname, '..', 'storage.rules'), 'utf8') },
	});
});

afterAll(async () => {
	await testEnv.cleanup();
});

beforeEach(async () => {
	await testEnv.clearFirestore();
	await testEnv.clearStorage();

	// The season these rules read to decide. Only the two rosters matter here,
	// but it is written whole so that a rule reaching for another field of it
	// would still be answering the question it thinks it is.
	await testEnv.withSecurityRulesDisabled(async context => {
		await setDoc(doc(context.firestore(), `seasons/${SEASON}`), {
			id: SEASON,
			name: 'Autumn 2026',
			status: 'active',
			startDate: '2026-09-01',
			endDate: '2026-12-15',
			venue: { name: 'Frescati IP' },
			slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'Europe/Stockholm' },
			minPlayers: 10,
			memberUids: [MEMBER, SEASON_ADMIN],
			adminUids: [SEASON_ADMIN],
			createdAt: '2026-08-01T00:00:00.000Z',
			createdBy: APP_ADMIN,
		});
	});
});

/** A receipt already in the bucket, put there without asking the rules. */
const seedReceipt = async (receiptId = 'r1') => {
	await testEnv.withSecurityRulesDisabled(async context => {
		await uploadBytes(ref(context.storage(), receiptPath(receiptId)), aPdf(), pdf);
	});
};

describe('receipt files', () => {
	it('lets the squad read one', async () => {
		await seedReceipt();

		await assertSucceeds(getBytes(ref(storageOf(MEMBER), receiptPath('r1'))));
		await assertSucceeds(getBytes(ref(storageOf(SEASON_ADMIN), receiptPath('r1'))));
		await assertSucceeds(getBytes(ref(storageOf(APP_ADMIN, { admin: true }), receiptPath('r1'))));
	});

	// The one thing this feature has to get right. An extra is in no season's
	// squad, so a link forwarded out of the group chat gets them a screen that
	// says so rather than the file, and holding the exact path gets them nothing.
	it('refuses an extra, and anybody not signed in', async () => {
		await seedReceipt();

		await assertFails(getBytes(ref(storageOf(EXTRA), receiptPath('r1'))));
		await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), receiptPath('r1'))));
	});

	it('lets a season admin upload one and take it back', async () => {
		await assertSucceeds(uploadBytes(ref(storageOf(SEASON_ADMIN), receiptPath('r2')), aPdf(), pdf));
		await assertSucceeds(deleteObject(ref(storageOf(SEASON_ADMIN), receiptPath('r2'))));
	});

	it('refuses to let a member upload or delete one', async () => {
		await assertFails(uploadBytes(ref(storageOf(MEMBER), receiptPath('r3')), aPdf(), pdf));

		await seedReceipt('r4');
		await assertFails(deleteObject(ref(storageOf(MEMBER), receiptPath('r4'))));
	});

	// Said on the client too, so that picking the wrong thing is a sentence
	// rather than a failed upload. This is the copy that decides.
	it('refuses a type payroll will not open', async () => {
		await assertFails(
			uploadBytes(ref(storageOf(SEASON_ADMIN), receiptPath('r5')), aPdf(), { contentType: 'text/html' })
		);
	});

	it('refuses a file over the limit', async () => {
		await assertFails(
			uploadBytes(ref(storageOf(SEASON_ADMIN), receiptPath('r6')), new Uint8Array(10_000_001), pdf)
		);
	});

	// The bucket holds receipts and nothing else. Anything outside that prefix
	// has no rule over it, and a path with no rule is a path nobody may write.
	it("refuses anything outside a season's receipts", async () => {
		await assertFails(uploadBytes(ref(storageOf(SEASON_ADMIN), 'loose.pdf'), aPdf(), pdf));
		await assertFails(uploadBytes(ref(storageOf(SEASON_ADMIN), `seasons/${SEASON}/anything-else/r7`), aPdf(), pdf));
	});

	// The cascade deletes the files when a season goes, but the rule is what
	// makes the window between the two safe: with the season document gone
	// there is no roster to be on, so a leftover object is readable by nobody.
	it('refuses everybody once the season it belongs to is gone', async () => {
		await seedReceipt('r8');

		await testEnv.withSecurityRulesDisabled(async context => {
			await deleteDoc(doc(context.firestore(), `seasons/${SEASON}`));
		});

		await assertFails(getBytes(ref(storageOf(MEMBER), receiptPath('r8'))));
	});
});
