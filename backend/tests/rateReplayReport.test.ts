import { main as rateReplayReport } from '../scripts/rateReplayReport';
import type { ScriptContext } from '../scripts/lib/script';
import { clearFirestore, getDb, writeMatch, writeSeason, writeTeams } from './helpers';

/**
 * The read-only report that prices the new rating formula against real history.
 *
 * Covered because it is the thing the decision gets made from, and it is about
 * to be pointed at the live project: a report that quietly dropped half the
 * ledger, or priced an evening off a scoreline `selectPlayedMatches` would never
 * have rated, would answer the question wrongly rather than visibly. So what
 * these check is that it recomputes what it says it recomputes, and that every
 * game it cannot recompute is named rather than skipped in silence.
 *
 * The other half of its job — writing nothing — is checked directly, since this
 * is the one script in the folder with no `--dry-run` to fall back on.
 */

const SEASON_ID = 'season-1';
const TEAM_A = ['p1', 'p2', 'p3', 'p4'];
const TEAM_B = ['p5', 'p6', 'p7', 'p8'];

const context = ({ args = [] as string[] } = {}): ScriptContext => ({
	db: getDb(),
	projectId: 'demo-frescati',
	dryRun: false,
	args,
});

let errors: jest.SpyInstance;

const output = (): string =>
	[...(console.log as jest.Mock).mock.calls, ...errors.mock.calls].map(call => call.map(String).join(' ')).join('\n');

const settled = (elo: number) => ({ elo, games: 10, updatedAt: '2026-08-01T00:00:00.000Z' });

/** A rated two-team game, with the ledger entry it would have left behind. */
const playedGame = async (gameId: string, kickoff: string, overrides: Record<string, unknown> = {}) => {
	await writeTeams(SEASON_ID, gameId, [TEAM_A, TEAM_B]);
	await writeMatch(SEASON_ID, gameId, { order: 0, teamA: 0, teamB: 1, scoreA: 2, scoreB: 1 });

	await getDb()
		.doc(`ratingLedger/${gameId}`)
		.set({
			seasonId: SEASON_ID,
			gameId,
			kickoff,
			kickoffMillis: Date.parse(kickoff),
			finalisedAt: kickoff,
			before: Object.fromEntries([...TEAM_A, ...TEAM_B].map(uid => [uid, settled(1000)])),
			after: Object.fromEntries(
				[...TEAM_A, ...TEAM_B].map(uid => [uid, settled(TEAM_A.includes(uid) ? 1020 : 980)])
			),
			positions: Object.fromEntries([...TEAM_A, ...TEAM_B].map(uid => [uid, TEAM_A.includes(uid) ? 0 : 1])),
			...overrides,
		});
};

beforeEach(async () => {
	await clearFirestore();
	errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
	await writeSeason(SEASON_ID, { memberUids: [...TEAM_A, ...TEAM_B] });
});

afterEach(() => errors.mockRestore());

describe('rate-replay-report', () => {
	it('says so and stops when nothing has been rated yet', async () => {
		await rateReplayReport(context());

		expect(output()).toContain('0 rated games in the ledger');
	});

	it('prices every K it was asked for, and the shipped one by default', async () => {
		await playedGame('game-1', '2026-09-01T17:00:00.000Z');

		await rateReplayReport(context());
		expect(output()).toContain('K=20');

		(console.log as jest.Mock).mockClear();
		await rateReplayReport(context({ args: ['33'] }));

		expect(output()).toContain('K=33');
		expect(output()).not.toContain('K=20');
	});

	// The headline the whole change is being judged on. Team A won its one match
	// against an even field, which is a perfect rate and first place: half a K,
	// or two of the displayed 0-100 at the shipped 20.
	it('reads a settled movement off the state the game was originally rated from', async () => {
		await playedGame('game-1', '2026-09-01T17:00:00.000Z');

		await rateReplayReport(context({ args: ['20'] }));

		expect(output()).toMatch(/K=20\s+2\.0\s+2\.0\s+2\.0/);
		// And what the entry says it paid at the time: 20 Elo, four of the same
		// points — which is the comparison the whole report exists to draw.
		expect(output()).toMatch(/as rated\s+4\.0/);
	});

	// The branch the live project actually takes: a group young enough that
	// nobody has finished their provisional games yet. There is no settled
	// median to print off nobody, but stopping there answered nothing at all.
	it('prices a ledger where everybody is still provisional', async () => {
		await playedGame('game-1', '2026-09-01T17:00:00.000Z', {
			before: Object.fromEntries([...TEAM_A, ...TEAM_B].map(uid => [uid, { ...settled(1000), games: 1 }])),
		});

		await rateReplayReport(context({ args: ['20'] }));

		expect(output()).toContain('provisional swing');
		// Twice the settled swing above, by design: four of the displayed 0-100.
		expect(output()).toMatch(/K=20\s+4\.0\s+4\.0\s+4\.0/);
	});

	it('refuses a K that is not a number', async () => {
		await playedGame('game-1', '2026-09-01T17:00:00.000Z');

		await expect(rateReplayReport(context({ args: ['soon'] }))).rejects.toThrow(/must be a K/);
	});

	it('writes nothing at all', async () => {
		await playedGame('game-1', '2026-09-01T17:00:00.000Z');

		await rateReplayReport(context());

		const ledger = await getDb().doc('ratingLedger/game-1').get();
		expect(ledger.data()?.after).toMatchObject({ p1: settled(1020) });
		expect(await getDb().doc(`seasons/${SEASON_ID}/games/game-1/tournament/result`).get()).toMatchObject({
			exists: false,
		});
	});

	describe('the games it cannot recompute', () => {
		it('names a game whose team sheet is gone', async () => {
			await playedGame('game-1', '2026-09-01T17:00:00.000Z');
			await getDb().doc(`seasons/${SEASON_ID}/games/game-1/tournament/teams`).delete();

			await rateReplayReport(context());

			expect(output()).toContain('no team sheet');
		});

		it('names a game whose season has been deleted', async () => {
			await playedGame('game-1', '2026-09-01T17:00:00.000Z');
			await getDb().doc(`seasons/${SEASON_ID}`).delete();

			await rateReplayReport(context());

			expect(output()).toContain('season is gone');
		});

		// A scoreline at an order a two-team rotation never reaches is the same
		// document `computeGameRatings` throws away, so pricing it here would
		// price an evening that was never played.
		it('names a game whose only scores are at orders the rotation never reached', async () => {
			await playedGame('game-1', '2026-09-01T17:00:00.000Z');
			await getDb().doc(`seasons/${SEASON_ID}/games/game-1/matches/0`).delete();
			await writeMatch(SEASON_ID, 'game-1', { order: 4, teamA: 0, teamB: 1, scoreA: 2, scoreB: 1 });

			await rateReplayReport(context());

			expect(output()).toContain('no scores survive the fixture check');
		});

		// Guessing the seed would price a first appearance off a number the game
		// never used — the same refusal `backfill-ledger-seed` makes.
		it('names a game that rated somebody unrated with no seed recorded', async () => {
			await playedGame('game-1', '2026-09-01T17:00:00.000Z', {
				before: Object.fromEntries(
					[...TEAM_A, ...TEAM_B].map(uid => [uid, uid === 'p1' ? null : settled(1000)])
				),
			});

			await rateReplayReport(context());

			expect(output()).toContain('backfill-ledger-seed');
		});

		it('still reports on the games it could recompute', async () => {
			await playedGame('game-1', '2026-09-01T17:00:00.000Z');
			await playedGame('game-2', '2026-09-08T17:00:00.000Z');
			await getDb().doc(`seasons/${SEASON_ID}/games/game-2/tournament/teams`).delete();

			await rateReplayReport(context());

			expect(output()).toContain('1 game recomputed');
			expect(output()).toContain('1 game could not be recomputed');
		});
	});
});
