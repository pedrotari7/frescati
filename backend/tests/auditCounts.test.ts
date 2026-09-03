import { auditGameCounts } from '../src/auditCounts';
import * as sentry from '../src/lib/sentry';
import { clearFirestore, writeGame, writeResponse, writeSeason } from './helpers';

/**
 * The audit reports rather than repairs, so what a test can observe is the
 * report, hence the spy on `reportError` rather than a read-back of the game.
 *
 * `writeResponse` writes to Firestore directly and these tests import the
 * handlers rather than running the functions emulator, so `onResponseWrite`
 * never fires. That is not a limitation to work around here: it produces
 * exactly the state this sweep exists to find: responses stored under a game
 * whose counters were never updated to match.
 */

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';

const hoursFromNow = (hours: number): string => new Date(Date.now() + hours * 3_600_000).toISOString();

const inFull = { status: 'in', role: 'member' } as const;

beforeEach(async () => {
	await clearFirestore();
});

afterEach(() => vi.restoreAllMocks());

describe('auditGameCounts', () => {
	it('reports a game whose counters never caught up with its responses', async () => {
		await writeSeason(SEASON_ID, { status: 'active', minPlayers: 10 });
		await writeGame(SEASON_ID, GAME_ID, { status: 'scheduled', kickoff: hoursFromNow(48) });
		await writeResponse(SEASON_ID, GAME_ID, 'member-1', inFull);
		const reportSpy = vi.spyOn(sentry, 'reportError').mockImplementation(() => undefined);

		await auditGameCounts.run(undefined as never);

		expect(reportSpy).toHaveBeenCalledTimes(1);
		const [message, context] = reportSpy.mock.calls[0];
		expect(message).toContain('1 of 1');
		expect(context).toMatchObject({
			checked: 1,
			drifted: [
				{
					seasonId: SEASON_ID,
					gameId: GAME_ID,
					drift: [
						{ field: 'membersIn', stored: 0, actual: 1 },
						{ field: 'playing', stored: 0, actual: 1 },
					],
				},
			],
		});
	});

	// Every future game in a fresh season is in this state. A sweep that
	// reported it would file a issue about the whole database on its first run.
	it('says nothing about a game nobody has answered yet', async () => {
		await writeSeason(SEASON_ID, { status: 'active', minPlayers: 10 });
		await writeGame(SEASON_ID, GAME_ID, { status: 'scheduled', kickoff: hoursFromNow(48) });
		const reportSpy = vi.spyOn(sentry, 'reportError').mockImplementation(() => undefined);

		await auditGameCounts.run(undefined as never);

		expect(reportSpy).not.toHaveBeenCalled();
	});

	it('says nothing when the stored counters are correct', async () => {
		await writeSeason(SEASON_ID, { status: 'active', minPlayers: 1 });
		await writeGame(SEASON_ID, GAME_ID, {
			status: 'scheduled',
			kickoff: hoursFromNow(48),
			counts: { membersIn: 1, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 1 },
			atRisk: false,
		});
		await writeResponse(SEASON_ID, GAME_ID, 'member-1', inFull);
		const reportSpy = vi.spyOn(sentry, 'reportError').mockImplementation(() => undefined);

		await auditGameCounts.run(undefined as never);

		expect(reportSpy).not.toHaveBeenCalled();
	});

	// A drifted counter on a game already played changes nothing. The
	// tournament result is what that game means now.
	it('ignores a game that has already kicked off', async () => {
		await writeSeason(SEASON_ID, { status: 'active', minPlayers: 10 });
		await writeGame(SEASON_ID, GAME_ID, { status: 'scheduled', kickoff: hoursFromNow(-48) });
		await writeResponse(SEASON_ID, GAME_ID, 'member-1', inFull);
		const reportSpy = vi.spyOn(sentry, 'reportError').mockImplementation(() => undefined);

		await auditGameCounts.run(undefined as never);

		expect(reportSpy).not.toHaveBeenCalled();
	});

	it('ignores a cancelled game and a season that is not active', async () => {
		await writeSeason(SEASON_ID, { status: 'active', minPlayers: 10 });
		await writeGame(SEASON_ID, GAME_ID, { status: 'cancelled', kickoff: hoursFromNow(48) });
		await writeResponse(SEASON_ID, GAME_ID, 'member-1', inFull);

		await writeSeason('season-2', { status: 'draft', minPlayers: 10 });
		await writeGame('season-2', 'game-2', { status: 'scheduled', kickoff: hoursFromNow(48) });
		await writeResponse('season-2', 'game-2', 'member-1', inFull);

		const reportSpy = vi.spyOn(sentry, 'reportError').mockImplementation(() => undefined);

		await auditGameCounts.run(undefined as never);

		expect(reportSpy).not.toHaveBeenCalled();
	});

	// One report for the sweep, not one per game: a trigger that has stopped
	// working takes out every game it should have written.
	it('gathers every drifted game into a single report', async () => {
		await writeSeason(SEASON_ID, { status: 'active', minPlayers: 10 });

		for (const gameId of ['game-1', 'game-2', 'game-3']) {
			await writeGame(SEASON_ID, gameId, { status: 'scheduled', kickoff: hoursFromNow(48) });
			await writeResponse(SEASON_ID, gameId, 'member-1', inFull);
		}

		const reportSpy = vi.spyOn(sentry, 'reportError').mockImplementation(() => undefined);

		await auditGameCounts.run(undefined as never);

		expect(reportSpy).toHaveBeenCalledTimes(1);
		expect(reportSpy.mock.calls[0][0]).toContain('3 of 3');
	});
});
