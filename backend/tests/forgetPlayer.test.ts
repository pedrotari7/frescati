import { getAuth } from 'firebase-admin/auth';
import { main } from '../scripts/forgetPlayer';
import type { ScriptContext } from '../scripts/lib/script';
import {
	clearAuth,
	clearFirestore,
	createAuthUser,
	getDb,
	readResponse,
	readUser,
	writeGame,
	writeMatch,
	writeResponse,
	writeSeason,
	writeTeams,
	writeUser,
} from './helpers';
import type { Mock } from 'vitest';

/**
 * The only thing in this repo that destroys data on purpose, and the only one
 * with no undo.
 *
 * It runs against the real project from somebody's laptop, it deletes a Firebase
 * Auth account, and until now nothing exercised a line of it. The risk is not
 * that it fails loudly, that would be obvious on the first run. It is that it
 * erases one field too many, quietly, in a way that only shows up as a corrupted
 * ladder weeks later.
 *
 * So these are mostly about the second half of its contract: what it must
 * **keep**. The uid in shared history is the whole reason this script exists in
 * place of a delete, and `replayRatingsFrom` rebuilds each game from the state
 * the one before it left, so dropping one player's ledger entries would not
 * lose their history alone, it would corrupt every replay for everybody who ever
 * played alongside them.
 */

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const LEAVER = 'anna';
const STAYER = 'bosse';

const context = (args: string[], { dryRun = false } = {}): ScriptContext => ({
	db: getDb(),
	projectId: 'demo-frescati',
	dryRun,
	args,
});

/** Everything the script printed, as one string. `console.log` is a mock. */
const output = (): string => (console.log as Mock).mock.calls.map(call => call.map(String).join(' ')).join('\n');

const tokenIds = async (uid: string): Promise<string[]> => {
	const snapshot = await getDb().collection(`users/${uid}/pushTokens`).get();

	return snapshot.docs.map(doc => doc.id);
};

/** A player with something of every kind attached to them. */
const seedLeaver = async ({ adminUids = [LEAVER, STAYER] }: { adminUids?: string[] } = {}) => {
	await createAuthUser(LEAVER, { displayName: 'Anna', email: 'anna@example.test' });
	await createAuthUser(STAYER, { displayName: 'Bosse' });

	await writeUser(LEAVER, {
		displayName: 'Anna',
		photoURL: 'https://example.test/anna.jpg',
		rating: 1520,
		client: { platform: 'ios', lastStandaloneAt: '2026-08-01T00:00:00.000Z' },
	} as Partial<Parameters<typeof writeUser>[1]>);

	await getDb().doc(`users/${LEAVER}/pushTokens/token-a`).set({ token: 'token-a', platform: 'ios' });
	await getDb().doc(`users/${LEAVER}/pushTokens/token-b`).set({ token: 'token-b', platform: 'web' });

	await writeSeason(SEASON_ID, { memberUids: [LEAVER, STAYER], adminUids });
	await writeGame(SEASON_ID, GAME_ID);

	await writeResponse(SEASON_ID, GAME_ID, LEAVER, { status: 'in', note: 'can only play the first half' });
	await writeResponse(SEASON_ID, GAME_ID, STAYER, { status: 'in' });

	// Shared history: a lineup, a scoreline they entered, and a ledger entry.
	await writeTeams(SEASON_ID, GAME_ID, [
		[LEAVER, STAYER],
		['c', 'd'],
	]);
	await writeMatch(SEASON_ID, GAME_ID, { order: 0, teamA: 0, teamB: 1, updatedBy: LEAVER });
	await getDb()
		.doc(`ratingLedger/${GAME_ID}`)
		.set({
			gameId: GAME_ID,
			seasonId: SEASON_ID,
			kickoffMillis: 1_756_745_000_000,
			positions: { [LEAVER]: 0, [STAYER]: 1 },
			changes: [{ uid: LEAVER, before: 1500, after: 1520 }],
		});
};

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

describe('what forget-player erases', () => {
	beforeEach(seedLeaver);

	it('deletes the Firebase Auth account, which is where the address lived', async () => {
		await main(context([LEAVER]));

		await expect(getAuth().getUser(LEAVER)).rejects.toMatchObject({ code: 'auth/user-not-found' });
	});

	it('anonymises the profile without deleting it', async () => {
		// `users/{uid}` is `allow delete: if false` on purpose, every roster
		// renders names off it, so a missing one turns a squad list into a wall
		// of "Unknown player".
		await main(context([LEAVER]));

		const profile = await readUser(LEAVER);
		expect(profile).toBeDefined();
		expect(profile?.displayName).toBe('Former player');
		expect(profile?.photoURL).toBeNull();
		expect(profile).not.toHaveProperty('client');
		expect(profile).not.toHaveProperty('email');
	});

	it('deletes every registered push token', async () => {
		// A token is a capability to push to a device, so leaving one behind is
		// leaving a way to reach somebody who asked to be forgotten.
		await main(context([LEAVER]));

		expect(await tokenIds(LEAVER)).toEqual([]);
	});

	it('clears the free-text note off their responses', async () => {
		await main(context([LEAVER]));

		const response = await readResponse(SEASON_ID, GAME_ID, LEAVER);
		expect(response).not.toHaveProperty('note');
	});

	it('takes them off the roster', async () => {
		await main(context([LEAVER]));

		const season = await getDb().doc(`seasons/${SEASON_ID}`).get();
		expect(season.get('memberUids')).toEqual([STAYER]);
		expect(season.get('adminUids')).toEqual([STAYER]);
	});
});

describe('what forget-player keeps', () => {
	beforeEach(seedLeaver);

	it('leaves the in/out of every response, which a headcount was built on', async () => {
		await main(context([LEAVER]));

		const response = await readResponse(SEASON_ID, GAME_ID, LEAVER);
		expect(response?.status).toBe('in');
		expect(response?.uid).toBe(LEAVER);
	});

	it('leaves the rating ledger completely alone', async () => {
		// The undo history for the *whole* ladder. `replayRatingsFrom` rebuilds
		// each game from the state the one before it left, so removing these
		// entries would corrupt every replay for everybody who played alongside
		// them, not just lose their own history.
		const before = (await getDb().doc(`ratingLedger/${GAME_ID}`).get()).data();

		await main(context([LEAVER]));

		expect((await getDb().doc(`ratingLedger/${GAME_ID}`).get()).data()).toEqual(before);
	});

	it('leaves the generated lineup and the scoreboard they wrote on', async () => {
		await main(context([LEAVER]));

		const teams = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}/tournament/teams`).get();
		expect(teams.get('teams')[0].uids).toContain(LEAVER);

		const match = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}/matches/0`).get();
		expect(match.get('updatedBy')).toBe(LEAVER);
	});

	it('leaves the rating, which the ledger can reproduce anyway', async () => {
		// Clearing it would only put the profile out of step with the entries
		// that explain it.
		await main(context([LEAVER]));

		expect((await readUser(LEAVER))?.rating).toBe(1520);
	});
});

describe('kit still recorded as theirs', () => {
	beforeEach(async () => {
		await seedLeaver();
		await getDb()
			.doc(`seasons/${SEASON_ID}/kit/ball-1`)
			.set({ name: 'Match ball', kind: 'ball', holderUid: LEAVER });
	});

	it('is reported rather than reassigned', async () => {
		// The app has no idea who has the ball now. Quietly handing it to the
		// nearest admin would replace a visible problem with an invisible wrong
		// answer, `findStrandedKit` strikes the same bargain.
		await main(context([LEAVER]));

		expect(output()).toContain('Match ball');
		expect(output()).toMatch(/still recorded as theirs/);
	});

	it('is left exactly where it was', async () => {
		await main(context([LEAVER]));

		const item = await getDb().doc(`seasons/${SEASON_ID}/kit/ball-1`).get();
		expect(item.get('holderUid')).toBe(LEAVER);
	});
});

describe('a season they are the only admin of', () => {
	beforeEach(() => seedLeaver({ adminUids: [LEAVER] }));

	it('is left untouched, because the rules refuse to leave a season with none', async () => {
		await main(context([LEAVER]));

		const season = await getDb().doc(`seasons/${SEASON_ID}`).get();
		expect(season.get('adminUids')).toEqual([LEAVER]);
	});

	it('is reported as unfinished rather than done', async () => {
		// Reading "Done" while a season still lists them by name in its admin
		// list is the failure this wording exists to prevent.
		await main(context([LEAVER]));

		expect(output()).toContain(`Still an admin of ${SEASON_ID}`);
		expect(output()).not.toContain('They are an id with nothing attached');
	});
});

describe('how forget-player is called', () => {
	beforeEach(seedLeaver);

	it('accepts an email, because that is what somebody asks to be forgotten from', async () => {
		await main(context(['anna@example.test']));

		await expect(getAuth().getUser(LEAVER)).rejects.toMatchObject({ code: 'auth/user-not-found' });
		expect((await readUser(LEAVER))?.displayName).toBe('Former player');
	});

	it('refuses an email with no account behind it', async () => {
		await expect(main(context(['nobody@example.test']))).rejects.toThrow(/Re-run with the uid/);
	});

	it('still cleans up Firestore for a uid whose account is already gone', async () => {
		// Exactly what a half-finished earlier run leaves behind, and the reason
		// the account is deleted last.
		await getAuth().deleteUser(LEAVER);

		await main(context([LEAVER]));

		expect((await readUser(LEAVER))?.displayName).toBe('Former player');
		expect(await tokenIds(LEAVER)).toEqual([]);
	});

	it('says how to call it when given nothing', async () => {
		await expect(main(context([]))).rejects.toThrow(/Usage: /);
	});
});

describe('running it twice', () => {
	beforeEach(seedLeaver);

	it('writes nothing the second time and says so', async () => {
		await main(context([LEAVER]));
		(console.log as Mock).mockClear();

		await main(context([LEAVER]));

		expect(output()).toContain('Nothing left to do.');
	});

	it('does not re-anonymise an already anonymised profile', async () => {
		await main(context([LEAVER]));
		const after = await readUser(LEAVER);

		await main(context([LEAVER]));

		// `displayName` is the field that can be present but already cleared, so
		// it is the one that has to be compared rather than merely defined.
		expect(await readUser(LEAVER)).toEqual(after);
	});
});

describe('--dry-run', () => {
	beforeEach(seedLeaver);

	it('writes nothing at all', async () => {
		await main(context([LEAVER], { dryRun: true }));

		const profile = await readUser(LEAVER);
		expect(profile?.displayName).toBe('Anna');
		expect(profile?.photoURL).toBe('https://example.test/anna.jpg');
		expect(await tokenIds(LEAVER)).toEqual(['token-a', 'token-b']);
		expect((await readResponse(SEASON_ID, GAME_ID, LEAVER))?.note).toBeDefined();
		await expect(getAuth().getUser(LEAVER)).resolves.toBeDefined();
	});

	it('still prints the plan it would have carried out', async () => {
		await main(context([LEAVER], { dryRun: true }));

		expect(output()).toContain('2 to delete');
		expect(output()).toContain('Dry run, nothing written.');
	});
});
