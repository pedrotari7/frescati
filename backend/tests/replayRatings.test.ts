import { main as replayRatings } from '../scripts/replayRatings';
import type { ScriptContext } from '../scripts/lib/script';
import {
	clearFirestore,
	getDb,
	readRatingLedger,
	readUser,
	writeGame,
	writeMatch,
	writeSeason,
	writeTeams,
	writeUser,
} from './helpers';

/**
 * The only way to say "re-rate everything" from outside a trigger.
 *
 * Worth its own suite for a reason none of the other scripts have: this one is
 * run once, against the real ladder, after the formula it replays under has
 * already changed. There is no second run to notice a mistake with — a wrong
 * window or a rewind that didn't happen leaves every rating in the group wrong
 * and nothing to compare against, because the code that produced the old
 * numbers is gone by then.
 *
 * So these check the two things a caller has to be able to trust: that it hands
 * the work to `requestRatingReplay` and the ratings actually move, and that
 * `--dry-run` genuinely reads. The replay itself is covered in
 * `finaliseTournament.test.ts` — what is new here is who starts it and from when.
 */

const SEASON_ID = 'season-1';
const TEAM_A = ['p1', 'p2', 'p3', 'p4'];
const TEAM_B = ['p5', 'p6', 'p7', 'p8'];
const EVERYBODY = [...TEAM_A, ...TEAM_B];

const context = ({ args = [] as string[], dryRun = false } = {}): ScriptContext => ({
	db: getDb(),
	projectId: 'demo-frescati',
	dryRun,
	args,
});

const output = (): string => (console.log as jest.Mock).mock.calls.map(call => call.map(String).join(' ')).join('\n');

const rating = (elo: number) => ({ elo, games: 10, updatedAt: '2026-08-01T00:00:00.000Z' });

/**
 * A confirmed game, and the ledger entry it left behind — with an `after` that
 * the current formula disagrees with, which is exactly the situation a retune
 * creates. Everyone starts the game level, so a replay owes team A the same
 * movement either way and only the size of it is in question.
 */
const ratedGame = async (gameId: string, kickoff: string, paid: number) => {
	await writeGame(SEASON_ID, gameId, {
		kickoff,
		status: 'played',
		resultFinalisedAt: kickoff,
	});
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
			before: Object.fromEntries(EVERYBODY.map(uid => [uid, rating(1000)])),
			after: Object.fromEntries(
				EVERYBODY.map(uid => [uid, rating(1000 + (TEAM_A.includes(uid) ? paid : -paid))])
			),
			positions: Object.fromEntries(EVERYBODY.map(uid => [uid, TEAM_A.includes(uid) ? 0 : 1])),
		});

	// The ladder as that entry left it, which is what the rewind has to undo.
	for (const uid of EVERYBODY) {
		await writeUser(uid, { rating: rating(1000 + (TEAM_A.includes(uid) ? paid : -paid)) });
	}
};

/**
 * What the current formula pays a settled winner of a level two-team game — the
 * 2-1 above, so a scoreline the rate reads as four fifths rather than a whole
 * win. `0.8 x (0.8 - 0.5) + 0.2 x 0.5`, at K = 20.
 */
const NOW_PAYS = 6.8;

/** What the old one paid, still sitting in the ledger. */
const USED_TO_PAY = 25;

beforeEach(async () => {
	await clearFirestore();
	await writeSeason(SEASON_ID, { memberUids: EVERYBODY });
});

describe('replay-ratings', () => {
	it('says so and stops when nothing has been rated yet', async () => {
		await replayRatings(context());

		expect(output()).toContain('0 rated games to replay');
		expect(output()).toContain('Nothing to do');
	});

	it('re-rates the whole ledger under the formula the code ships today', async () => {
		await ratedGame('game-1', '2026-09-01T17:00:00.000Z', USED_TO_PAY);

		await replayRatings(context());

		expect((await readUser('p1'))?.rating?.elo).toBe(1000 + NOW_PAYS);
		expect((await readUser('p5'))?.rating?.elo).toBe(1000 - NOW_PAYS);
		expect((await readRatingLedger('game-1'))?.after['p1'].elo).toBe(1000 + NOW_PAYS);
		expect(output()).toContain('1 game re-rated');
	});

	it('names the window and the people it touches before touching them', async () => {
		await ratedGame('game-1', '2026-09-01T17:00:00.000Z', USED_TO_PAY);
		await ratedGame('game-2', '2026-09-08T17:00:00.000Z', USED_TO_PAY);

		await replayRatings(context());

		expect(output()).toContain('2 rated games to replay — the whole ledger');
		expect(output()).toContain('2026-09-01 to 2026-09-08');
		expect(output()).toContain('8 players');
	});

	it('leaves everything exactly as it was on a dry run', async () => {
		await ratedGame('game-1', '2026-09-01T17:00:00.000Z', USED_TO_PAY);

		await replayRatings(context({ dryRun: true }));

		expect((await readUser('p1'))?.rating?.elo).toBe(1000 + USED_TO_PAY);
		expect((await readRatingLedger('game-1'))?.after['p1'].elo).toBe(1000 + USED_TO_PAY);
		expect(output()).toContain('Dry run, nothing written');
	});

	// The narrower call the script also has to support — a formula change wants
	// the whole ledger, but a scoreline corrected by hand in the database wants
	// everything from that game onwards and nothing before it.
	it('replays from a date, leaving the games before it alone', async () => {
		await ratedGame('game-1', '2026-09-01T17:00:00.000Z', USED_TO_PAY);
		await ratedGame('game-2', '2026-09-08T17:00:00.000Z', USED_TO_PAY);

		await replayRatings(context({ args: ['2026-09-05'] }));

		// The window it was asked for, then the games actually in it.
		expect(output()).toContain('1 rated game to replay — from 2026-09-05');
		expect(output()).toContain('2026-09-08 to 2026-09-08');
		expect((await readRatingLedger('game-1'))?.after['p1'].elo).toBe(1000 + USED_TO_PAY);
		expect((await readRatingLedger('game-2'))?.after['p1'].elo).toBe(1000 + NOW_PAYS);
	});

	it('refuses a date it cannot read rather than replaying the whole ledger', async () => {
		await expect(replayRatings(context({ args: ['last tuesday'] }))).rejects.toThrow('Not a date');
		await expect(replayRatings(context({ args: ['2026-09-01', '2026-09-08'] }))).rejects.toThrow(
			'One date at most'
		);
	});
});
