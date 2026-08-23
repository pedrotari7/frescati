import { FieldValue } from 'firebase-admin/firestore';
import { main as backfillKickoffMillis } from '../scripts/backfillKickoffMillis';
import { main as backfillLedgerSeed } from '../scripts/backfillLedgerSeed';
import { main as backfillLedgerTeams } from '../scripts/backfillLedgerTeams';
import { main as backfillMotmVoters } from '../scripts/backfillMotmVoters';
import type { ScriptContext } from '../scripts/lib/script';
import {
	clearAuth,
	clearFirestore,
	getDb,
	readMotmVoters,
	writeGame,
	writeMotmVote,
	writeSeason,
	writeTeams,
} from './helpers';

/**
 * The one-shot repairs, and the line all four of them walk.
 *
 * Every one exists because a field was added after the data was, so each has to
 * reconstruct history from a second copy of it. That makes them the scripts most
 * able to do quiet damage: a backfill that guesses writes a plausible number
 * into a permanent record, and a replay years later preserves the guess rather
 * than correcting it.
 *
 * So the interesting half of each is not the filling in. It is the refusing:
 * every one of them skips and reports rather than inventing an answer when the
 * source it reads back is gone, incomplete, or no longer describes the same
 * game. Those branches are what these mostly cover, because they are the ones
 * nobody exercises by running the script on a healthy database.
 */

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';

const context = ({ dryRun = false, args = [] as string[] } = {}): ScriptContext => ({
	db: getDb(),
	projectId: 'demo-frescati',
	dryRun,
	args,
});

/**
 * What the script printed, both streams: every skip goes to `console.error`,
 * which setup.ts deliberately leaves unmocked, so this file spies on it for the
 * length of each test rather than globally.
 */
let errors: jest.SpyInstance;

const output = (): string =>
	[...(console.log as jest.Mock).mock.calls, ...errors.mock.calls].map(call => call.map(String).join(' ')).join('\n');

const ledgerEntry = (overrides: Record<string, unknown> = {}) => ({
	seasonId: SEASON_ID,
	gameId: GAME_ID,
	kickoff: '2026-09-01T17:00:00.000Z',
	kickoffMillis: Date.parse('2026-09-01T17:00:00.000Z'),
	finalisedAt: '2026-09-01T21:00:00.000Z',
	before: { anna: 1500, bosse: 1480 },
	after: { anna: 1512, bosse: 1468 },
	positions: { anna: 0, bosse: 1 },
	...overrides,
});

const writeLedger = (gameId: string, overrides: Record<string, unknown> = {}) =>
	getDb()
		.doc(`ratingLedger/${gameId}`)
		.set(ledgerEntry({ gameId, ...overrides }));

const readLedger = async (gameId: string) => (await getDb().doc(`ratingLedger/${gameId}`).get()).data();

const writeResult = (gameId: string, changes: { uid: string; before: number | null }[]) =>
	getDb()
		.doc(`seasons/${SEASON_ID}/games/${gameId}/tournament/result`)
		.set({ standings: [], changes, finalisedAt: '2026-09-01T21:00:00.000Z', finalisedBy: null });

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
	errors = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => errors.mockRestore());

describe('backfill-kickoff-millis', () => {
	beforeEach(() => writeSeason(SEASON_ID));

	it('fills in a mirror that was never written', async () => {
		// Rules enforce the response deadline against this number because they
		// cannot parse ISO 8601, and a game missing it is answerable forever.
		await writeGame(SEASON_ID, GAME_ID, { kickoff: '2026-09-01T17:00:00.000Z' });
		await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}`).update({ kickoffMillis: FieldValue.delete() });

		await backfillKickoffMillis(context());

		const game = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}`).get();
		expect(game.get('kickoffMillis')).toBe(Date.parse('2026-09-01T17:00:00.000Z'));
	});

	it('corrects a mirror that drifted, which is the sharper case', async () => {
		// A wrong mirror is worse than an absent one: the deadline is enforced
		// against the wrong instant, silently, rather than not at all.
		await writeGame(SEASON_ID, GAME_ID, { kickoff: '2026-09-01T17:00:00.000Z', kickoffMillis: 1 });

		await backfillKickoffMillis(context());

		const game = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}`).get();
		expect(game.get('kickoffMillis')).toBe(Date.parse('2026-09-01T17:00:00.000Z'));
	});

	it('leaves a calendar that already agrees alone', async () => {
		await writeGame(SEASON_ID, GAME_ID);

		await backfillKickoffMillis(context());

		expect(output()).toContain('Nothing to do.');
	});

	it('writes nothing on a dry run', async () => {
		await writeGame(SEASON_ID, GAME_ID, { kickoff: '2026-09-01T17:00:00.000Z', kickoffMillis: 1 });

		await backfillKickoffMillis(context({ dryRun: true }));

		const game = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}`).get();
		expect(game.get('kickoffMillis')).toBe(1);
		expect(output()).toContain('Dry run, nothing written.');
	});
});

describe('backfill-ledger-seed', () => {
	it('records what the unrated were seeded at, from the result it was rated into', async () => {
		await writeLedger(GAME_ID, { before: { anna: null, bosse: 1480 } });
		await writeResult(GAME_ID, [
			{ uid: 'anna', before: 1493.5 },
			{ uid: 'bosse', before: 1480 },
		]);

		await backfillLedgerSeed(context());

		expect((await readLedger(GAME_ID))?.seedElo).toBe(1493.5);
	});

	it('skips a game whose result is gone rather than guessing', async () => {
		// A plausible seed is unrecoverable once the result is missing, and
		// writing a guess would replace a visible gap with an invisible wrong
		// answer that every later replay preserves.
		await writeLedger(GAME_ID, { before: { anna: null } });

		await backfillLedgerSeed(context());

		expect((await readLedger(GAME_ID))?.seedElo).toBeUndefined();
		expect(output()).toContain('no result document, skipped');
	});

	it('skips a result that does not cover every unrated player', async () => {
		await writeLedger(GAME_ID, { before: { anna: null, bosse: null } });
		await writeResult(GAME_ID, [{ uid: 'anna', before: 1493.5 }]);

		await backfillLedgerSeed(context());

		expect((await readLedger(GAME_ID))?.seedElo).toBeUndefined();
		expect(output()).toContain('does not cover every unrated player, skipped');
	});

	it('skips a result that disagrees with itself about the seed', async () => {
		// Everybody unrated in one game seeds at the same average, so these are
		// copies of one number. Disagreeing means the result is no longer the one
		// this entry was computed from, and neither copy can be trusted.
		await writeLedger(GAME_ID, { before: { anna: null, bosse: null } });
		await writeResult(GAME_ID, [
			{ uid: 'anna', before: 1493.5 },
			{ uid: 'bosse', before: 1502.25 },
		]);

		await backfillLedgerSeed(context());

		expect((await readLedger(GAME_ID))?.seedElo).toBeUndefined();
		expect(output()).toContain('disagrees with itself about the seed, skipped');
	});

	it('leaves an entry where nobody was unrated without a seed', async () => {
		// There was no seed to record, so absent is the correct state rather than
		// a gap to fill.
		await writeLedger(GAME_ID);
		await writeResult(GAME_ID, [{ uid: 'anna', before: 1500 }]);

		await backfillLedgerSeed(context());

		expect(await readLedger(GAME_ID)).not.toHaveProperty('seedElo');
		expect(output()).toContain('Nothing to do.');
	});

	it('leaves an entry that already carries one alone', async () => {
		await writeLedger(GAME_ID, { before: { anna: null }, seedElo: 1400 });
		await writeResult(GAME_ID, [{ uid: 'anna', before: 1493.5 }]);

		await backfillLedgerSeed(context());

		expect((await readLedger(GAME_ID))?.seedElo).toBe(1400);
	});

	it('writes nothing on a dry run', async () => {
		await writeLedger(GAME_ID, { before: { anna: null } });
		await writeResult(GAME_ID, [{ uid: 'anna', before: 1493.5 }]);

		await backfillLedgerSeed(context({ dryRun: true }));

		expect((await readLedger(GAME_ID))?.seedElo).toBeUndefined();
		expect(output()).toContain('Dry run, nothing written.');
	});
});

describe('backfill-ledger-teams', () => {
	beforeEach(() => writeSeason(SEASON_ID));

	it('records who played with whom, from the sheet the game was rated against', async () => {
		// Safe to read back years later for exactly the reason a replay can: a
		// confirmed game's lineup is never rebuilt.
		await writeLedger(GAME_ID, { positions: { anna: 0, bosse: 1 } });
		await writeGame(SEASON_ID, GAME_ID);
		await writeTeams(SEASON_ID, GAME_ID, [['anna'], ['bosse']]);

		await backfillLedgerTeams(context());

		expect((await readLedger(GAME_ID))?.teams).toEqual({ anna: 0, bosse: 1 });
	});

	it('skips a game whose team sheet is gone', async () => {
		await writeLedger(GAME_ID);

		await backfillLedgerTeams(context());

		expect(await readLedger(GAME_ID)).not.toHaveProperty('teams');
		expect(output()).toContain('no team sheet, skipped');
	});

	it('skips a sheet that names a different squad than the entry rated', async () => {
		// The two have to describe the same game. If a lineup was somehow
		// rewritten after the ratings were applied, copying it across would
		// record teams nobody played on.
		await writeLedger(GAME_ID, { positions: { anna: 0, bosse: 1 } });
		await writeGame(SEASON_ID, GAME_ID);
		await writeTeams(SEASON_ID, GAME_ID, [['anna'], ['calle']]);

		await backfillLedgerTeams(context());

		expect(await readLedger(GAME_ID)).not.toHaveProperty('teams');
		expect(output()).toContain('disagrees with the ledger, skipped');
	});

	it('leaves an entry that already has a team map alone', async () => {
		await writeLedger(GAME_ID, { teams: { anna: 1, bosse: 0 } });
		await writeGame(SEASON_ID, GAME_ID);
		await writeTeams(SEASON_ID, GAME_ID, [['anna'], ['bosse']]);

		await backfillLedgerTeams(context());

		expect((await readLedger(GAME_ID))?.teams).toEqual({ anna: 1, bosse: 0 });
	});

	it('writes nothing on a dry run', async () => {
		await writeLedger(GAME_ID);
		await writeGame(SEASON_ID, GAME_ID);
		await writeTeams(SEASON_ID, GAME_ID, [['anna'], ['bosse']]);

		await backfillLedgerTeams(context({ dryRun: true }));

		expect(await readLedger(GAME_ID)).not.toHaveProperty('teams');
		expect(output()).toContain('Dry run, nothing written.');
	});
});

describe('backfill-motm-voters', () => {
	const OPEN = { motmVotingUntilMillis: Date.now() + 3_600_000 };

	beforeEach(() => writeSeason(SEASON_ID));

	it('rebuilds the turnout for a vote whose votes predate the trigger', async () => {
		await writeGame(SEASON_ID, GAME_ID, OPEN);
		await writeTeams(SEASON_ID, GAME_ID, [['anna'], ['bosse']]);
		await writeMotmVote(SEASON_ID, GAME_ID, 'anna', 'bosse');
		await writeMotmVote(SEASON_ID, GAME_ID, 'bosse', 'anna');
		// The trigger derives this; a game that voted before it was deployed has
		// none, and the panel reads that as "nobody has voted yet".
		await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}/tournament/motmVoters`).delete();

		await backfillMotmVoters(context());

		expect((await readMotmVoters(SEASON_ID, GAME_ID))?.uids.sort()).toEqual(['anna', 'bosse']);
	});

	it('leaves a turnout that is already right alone', async () => {
		await writeGame(SEASON_ID, GAME_ID, OPEN);
		await writeTeams(SEASON_ID, GAME_ID, [['anna'], ['bosse']]);
		await writeMotmVote(SEASON_ID, GAME_ID, 'anna', 'bosse');

		await backfillMotmVoters(context());
		(console.log as jest.Mock).mockClear();

		await backfillMotmVoters(context());

		// A preview that reports the same line either way cannot answer the
		// question anybody runs it to ask, which is whether this is already done.
		expect(output()).toContain('already correct');
	});

	it('ignores a game whose vote has been counted and closed', async () => {
		// The window is deleted with the count, and the turnout lives in the
		// published totals from then on. Writing one here would resurrect
		// something the sweep deliberately removed.
		await writeGame(SEASON_ID, GAME_ID);
		await writeTeams(SEASON_ID, GAME_ID, [['anna'], ['bosse']]);
		await writeMotmVote(SEASON_ID, GAME_ID, 'anna', 'bosse');
		await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}/tournament/motmVoters`).delete();

		await backfillMotmVoters(context());

		expect(await readMotmVoters(SEASON_ID, GAME_ID)).toBeUndefined();
	});

	it('writes nothing on a dry run', async () => {
		await writeGame(SEASON_ID, GAME_ID, OPEN);
		await writeTeams(SEASON_ID, GAME_ID, [['anna'], ['bosse']]);
		await writeMotmVote(SEASON_ID, GAME_ID, 'anna', 'bosse');
		await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}/tournament/motmVoters`).delete();

		await backfillMotmVoters(context({ dryRun: true }));

		expect(await readMotmVoters(SEASON_ID, GAME_ID)).toBeUndefined();
		expect(output()).toContain('Dry run, nothing written.');
	});
});
