import * as finalise from '../src/lib/finalise';
import { finaliseDueTournaments, finaliseTournament, onMatchWrite } from '../src/finaliseTournament';
import {
	callRequest,
	clearAuth,
	clearFirestore,
	paramsEvent,
	readGame,
	readRatingLedger,
	readUser,
	writeGame,
	writeMatch,
	writeSeason,
	writeTeams,
} from './helpers';

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const ADMIN = 'season-admin-1';
const OUTSIDER = 'outsider-1';

const TEAM_A = ['p1', 'p2', 'p3', 'p4'];
const TEAM_B = ['p5', 'p6', 'p7', 'p8'];

const hoursFromNow = (hours: number): string => new Date(Date.now() + hours * 3_600_000).toISOString();

/** The one match two teams play in a game — nobody else to rotate through. */
const writeGameMatches = async (scores: [number, number][]): Promise<void> => {
	for (const [order, [scoreA, scoreB]] of scores.entries()) {
		await writeMatch(SEASON_ID, GAME_ID, { order, teamA: 0, teamB: 1, scoreA, scoreB });
	}
};

const setUpGame = async (overrides: Parameters<typeof writeGame>[2] = {}) => {
	await writeSeason(SEASON_ID, { memberUids: [...TEAM_A, ...TEAM_B], adminUids: [ADMIN] });
	await writeGame(SEASON_ID, GAME_ID, overrides);
	await writeTeams(SEASON_ID, GAME_ID, [TEAM_A, TEAM_B]);
};

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

// `jest.spyOn` reuses the same mock across calls on an already-spied method, so
// without this its call count would keep accumulating across tests in this file.
afterEach(() => jest.restoreAllMocks());

describe('finaliseTournament', () => {
	it('rejects when nobody is signed in', async () => {
		await expect(
			finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }))
		).rejects.toMatchObject({ code: 'unauthenticated' });
	});

	it('rejects a request that does not say which game to confirm', async () => {
		await expect(finaliseTournament.run(callRequest({}, { uid: ADMIN }))).rejects.toMatchObject({
			code: 'invalid-argument',
		});
	});

	it('rejects a caller who is not a season admin', async () => {
		await setUpGame();
		await writeGameMatches([[2, 1]]);

		await expect(
			finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: OUTSIDER }))
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('reports a game that no longer exists as not found', async () => {
		await writeSeason(SEASON_ID, { adminUids: [ADMIN] });

		await expect(
			finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: 'ghost-game' }, { uid: ADMIN }))
		).rejects.toMatchObject({ code: 'not-found' });
	});

	it('refuses to confirm a game with no scores entered', async () => {
		await setUpGame();

		await expect(
			finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN }))
		).rejects.toMatchObject({ code: 'failed-precondition' });
	});

	it('lets a season admin confirm a played game and applies the ratings', async () => {
		await setUpGame();
		await writeGameMatches([[2, 1]]);

		const result = await finaliseTournament.run(
			callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN })
		);

		expect(result).toEqual({ ok: true });

		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.resultFinalisedAt).toBeTruthy();

		// Team A won against an evenly-seeded field, so every provisional player
		// swings the full 40 * 0.5 = 20 Elo either way.
		for (const uid of TEAM_A) expect((await readUser(uid))?.rating).toMatchObject({ elo: 1020, games: 1 });
		for (const uid of TEAM_B) expect((await readUser(uid))?.rating).toMatchObject({ elo: 980, games: 1 });

		const ledger = await readRatingLedger(GAME_ID);
		expect(ledger?.positions).toMatchObject({ p1: 0, p5: 1 });
	});

	it('records who was on which team, which the finishing places cannot say', async () => {
		await setUpGame();
		// Level, so both teams share first place and `positions` says the same
		// thing about all eight — the case that needs the team map.
		await writeGameMatches([[1, 1]]);

		await finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN }));

		const ledger = await readRatingLedger(GAME_ID);

		expect(ledger?.positions).toMatchObject({ p1: 0, p5: 0 });
		expect(ledger?.teams).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0, p5: 1, p6: 1, p7: 1, p8: 1 });
	});

	it('lets an app admin confirm even without season adminUids', async () => {
		await writeSeason(SEASON_ID, { memberUids: [...TEAM_A, ...TEAM_B], adminUids: [] });
		await writeGame(SEASON_ID, GAME_ID);
		await writeTeams(SEASON_ID, GAME_ID, [TEAM_A, TEAM_B]);
		await writeGameMatches([[2, 1]]);

		const result = await finaliseTournament.run(
			callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: 'app-admin-1', admin: true })
		);

		expect(result).toEqual({ ok: true });
	});

	it('rejects confirming a game that is already confirmed', async () => {
		await setUpGame();
		await writeGameMatches([[2, 1]]);
		await finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN }));

		await expect(
			finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN }))
		).rejects.toMatchObject({ code: 'failed-precondition' });
	});
});

describe('finaliseDueTournaments', () => {
	it('auto-confirms a played game once it is past the auto-finalise window', async () => {
		await setUpGame({ kickoff: hoursFromNow(-30), status: 'scheduled' });
		await writeGameMatches([[2, 1]]);

		await finaliseDueTournaments.run(undefined as never);

		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.resultFinalisedAt).toBeTruthy();
		expect((await readRatingLedger(GAME_ID))?.gameId).toBe(GAME_ID);
	});

	it('leaves a game with no scores unconfirmed', async () => {
		await setUpGame({ kickoff: hoursFromNow(-30), status: 'scheduled' });

		await finaliseDueTournaments.run(undefined as never);

		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.resultFinalisedAt).toBeUndefined();
	});

	it('leaves a game still inside its window alone', async () => {
		await setUpGame({ kickoff: hoursFromNow(-10), status: 'scheduled' });
		await writeGameMatches([[2, 1]]);

		await finaliseDueTournaments.run(undefined as never);

		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.resultFinalisedAt).toBeUndefined();
	});

	// Marking it retires the game from this query, which is what lets the query
	// have no lower bound — and so what stops a late-scored game falling out
	// of a window and never being rated at all.
	it('marks a game it confirms as played', async () => {
		await setUpGame({ kickoff: hoursFromNow(-30), status: 'scheduled' });
		await writeGameMatches([[2, 1]]);

		await finaliseDueTournaments.run(undefined as never);

		expect((await readGame(SEASON_ID, GAME_ID))?.status).toBe('played');
	});

	// The failure this whole change is about: scores entered a week and a half
	// after the game, which the old seven-day floor put permanently out of reach.
	it('still rates a game whose scores arrived long after it was played', async () => {
		await setUpGame({ kickoff: hoursFromNow(-24 * 10), status: 'scheduled' });

		// The sweep sees it with nothing to rate, repeatedly, and leaves it.
		await finaliseDueTournaments.run(undefined as never);
		expect((await readGame(SEASON_ID, GAME_ID))?.resultFinalisedAt).toBeUndefined();

		// Somebody finally fills in the scoreboard.
		await writeGameMatches([[2, 1]]);
		await finaliseDueTournaments.run(undefined as never);

		expect((await readGame(SEASON_ID, GAME_ID))?.resultFinalisedAt).toBeTruthy();
		expect((await readUser('p1'))?.rating).toMatchObject({ elo: 1020, games: 1 });
	});

	// Rated before confirming began marking the status, so still answering the
	// query. Retired in place rather than by a migration script.
	it('retires a game that was rated before the status was ever set', async () => {
		await setUpGame({ kickoff: hoursFromNow(-30), status: 'scheduled' });
		await writeGameMatches([[2, 1]]);
		await finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN }));

		// Put it back the way a pre-existing game looks: rated, still scheduled.
		await writeGame(SEASON_ID, GAME_ID, {
			kickoff: hoursFromNow(-30),
			status: 'scheduled',
			resultFinalisedAt: '2026-01-01T00:00:00.000Z',
		});

		await finaliseDueTournaments.run(undefined as never);

		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.status).toBe('played');
		// Retired, not re-rated — a second application would double-count it.
		expect(game?.resultFinalisedAt).toBe('2026-01-01T00:00:00.000Z');
		expect((await readUser('p1'))?.rating).toMatchObject({ games: 1 });
	});
});

describe('onMatchWrite', () => {
	it('replays ratings when a confirmed score is corrected', async () => {
		await setUpGame();
		await writeGameMatches([[2, 1]]);
		await finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN }));
		expect((await readUser('p1'))?.rating).toMatchObject({ elo: 1020 });

		// Reverse the outcome entirely: team B now wins the game instead of team A.
		await writeGameMatches([[0, 3]]);
		await onMatchWrite.run(paramsEvent({ seasonId: SEASON_ID, gameId: GAME_ID, order: '0' }));

		for (const uid of TEAM_A) expect((await readUser(uid))?.rating).toMatchObject({ elo: 980, games: 1 });
		for (const uid of TEAM_B) expect((await readUser(uid))?.rating).toMatchObject({ elo: 1020, games: 1 });

		const game = await readGame(SEASON_ID, GAME_ID);
		// A replay doesn't re-confirm the game — who confirmed it stands.
		const result = await readRatingLedger(GAME_ID);
		expect(result?.positions).toMatchObject({ p1: 1, p5: 0 });
		expect(game?.resultFinalisedAt).toBeTruthy();
	});

	// Spied on `requestRatingReplay` rather than `replayRatingsFrom`: that is
	// what the trigger calls, and the drain reaches the replay through a local
	// binding a module spy would never see — so spying there would pass here
	// whether or not the trigger had asked for anything.
	it('does nothing for a match under a game that is not yet confirmed', async () => {
		await setUpGame();
		await writeGameMatches([[2, 1]]);
		const replaySpy = jest.spyOn(finalise, 'requestRatingReplay');

		await onMatchWrite.run(paramsEvent({ seasonId: SEASON_ID, gameId: GAME_ID, order: '0' }));

		expect(replaySpy).not.toHaveBeenCalled();
	});

	// A burst of `onMatchWrite` firings for the same game — however many
	// documents actually changed. Before the ladder lock each ran its own
	// rewind-and-replay, and they interleaved.
	it('collapses a burst of corrections into a single replay', async () => {
		await setUpGame();
		await writeGameMatches([[2, 1]]);
		await finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN }));

		await writeGameMatches([[0, 3]]);

		await Promise.all(
			['0', '1', '2'].map(order => onMatchWrite.run(paramsEvent({ seasonId: SEASON_ID, gameId: GAME_ID, order })))
		);

		// Whatever order they landed in, the ladder agrees with the scoreboard
		// — and each player moved exactly one game's worth, not three.
		for (const uid of TEAM_A) expect((await readUser(uid))?.rating).toMatchObject({ elo: 980, games: 1 });
		for (const uid of TEAM_B) expect((await readUser(uid))?.rating).toMatchObject({ elo: 1020, games: 1 });
	});
});
