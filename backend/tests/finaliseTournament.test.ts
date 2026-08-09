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

/** Three matches, the full round robin two teams play in a night. */
const writeNightMatches = async (scores: [number, number][]): Promise<void> => {
	for (const [order, [scoreA, scoreB]] of scores.entries()) {
		await writeMatch(SEASON_ID, GAME_ID, { order, teamA: 0, teamB: 1, scoreA, scoreB });
	}
};

const setUpNight = async (overrides: Parameters<typeof writeGame>[2] = {}) => {
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
		await setUpNight();
		await writeNightMatches([
			[2, 1],
			[3, 1],
			[1, 1],
		]);

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

	it('refuses to confirm a night with no scores entered', async () => {
		await setUpNight();

		await expect(
			finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN }))
		).rejects.toMatchObject({ code: 'failed-precondition' });
	});

	it('lets a season admin confirm a played night and applies the ratings', async () => {
		await setUpNight();
		await writeNightMatches([
			[2, 1],
			[3, 1],
			[1, 1],
		]);

		const result = await finaliseTournament.run(
			callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN })
		);

		expect(result).toEqual({ ok: true });

		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.resultFinalisedAt).toBeTruthy();

		// Team A won two and drew one against an evenly-seeded field, so every
		// provisional player swings the full 40 * 0.5 = 20 Elo either way.
		for (const uid of TEAM_A) expect((await readUser(uid))?.rating).toMatchObject({ elo: 1020, games: 1 });
		for (const uid of TEAM_B) expect((await readUser(uid))?.rating).toMatchObject({ elo: 980, games: 1 });

		const ledger = await readRatingLedger(GAME_ID);
		expect(ledger?.positions).toMatchObject({ p1: 0, p5: 1 });
	});

	it('lets an app admin confirm even without season adminUids', async () => {
		await writeSeason(SEASON_ID, { memberUids: [...TEAM_A, ...TEAM_B], adminUids: [] });
		await writeGame(SEASON_ID, GAME_ID);
		await writeTeams(SEASON_ID, GAME_ID, [TEAM_A, TEAM_B]);
		await writeNightMatches([
			[2, 1],
			[3, 1],
			[1, 1],
		]);

		const result = await finaliseTournament.run(
			callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: 'app-admin-1', admin: true })
		);

		expect(result).toEqual({ ok: true });
	});

	it('rejects confirming a night that is already confirmed', async () => {
		await setUpNight();
		await writeNightMatches([
			[2, 1],
			[3, 1],
			[1, 1],
		]);
		await finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN }));

		await expect(
			finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN }))
		).rejects.toMatchObject({ code: 'failed-precondition' });
	});
});

describe('finaliseDueTournaments', () => {
	it('auto-confirms a played night once it is past the auto-finalise window', async () => {
		await setUpNight({ kickoff: hoursFromNow(-30), status: 'scheduled' });
		await writeNightMatches([
			[2, 1],
			[3, 1],
			[1, 1],
		]);

		await finaliseDueTournaments.run(undefined as never);

		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.resultFinalisedAt).toBeTruthy();
		expect((await readRatingLedger(GAME_ID))?.gameId).toBe(GAME_ID);
	});

	it('leaves a night with no scores unconfirmed', async () => {
		await setUpNight({ kickoff: hoursFromNow(-30), status: 'scheduled' });

		await finaliseDueTournaments.run(undefined as never);

		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.resultFinalisedAt).toBeUndefined();
	});

	it('leaves a night still inside its window alone', async () => {
		await setUpNight({ kickoff: hoursFromNow(-10), status: 'scheduled' });
		await writeNightMatches([
			[2, 1],
			[3, 1],
			[1, 1],
		]);

		await finaliseDueTournaments.run(undefined as never);

		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.resultFinalisedAt).toBeUndefined();
	});
});

describe('onMatchWrite', () => {
	it('replays ratings when a confirmed score is corrected', async () => {
		await setUpNight();
		await writeNightMatches([
			[2, 1],
			[3, 1],
			[1, 1],
		]);
		await finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN }));
		expect((await readUser('p1'))?.rating).toMatchObject({ elo: 1020 });

		// Reverse the outcome entirely: team B now wins both close games instead
		// of team A.
		await writeNightMatches([
			[0, 3],
			[1, 4],
			[1, 1],
		]);
		await onMatchWrite.run(paramsEvent({ seasonId: SEASON_ID, gameId: GAME_ID, order: '0' }));

		for (const uid of TEAM_A) expect((await readUser(uid))?.rating).toMatchObject({ elo: 980, games: 1 });
		for (const uid of TEAM_B) expect((await readUser(uid))?.rating).toMatchObject({ elo: 1020, games: 1 });

		const game = await readGame(SEASON_ID, GAME_ID);
		// A replay doesn't re-confirm the night — who confirmed it stands.
		const result = await readRatingLedger(GAME_ID);
		expect(result?.positions).toMatchObject({ p1: 1, p5: 0 });
		expect(game?.resultFinalisedAt).toBeTruthy();
	});

	// Spied on `requestRatingReplay` rather than `replayRatingsFrom`: that is
	// what the trigger calls, and the drain reaches the replay through a local
	// binding a module spy would never see — so spying there would pass here
	// whether or not the trigger had asked for anything.
	it('does nothing for a match under a night that is not yet confirmed', async () => {
		await setUpNight();
		await writeNightMatches([
			[2, 1],
			[3, 1],
			[1, 1],
		]);
		const replaySpy = jest.spyOn(finalise, 'requestRatingReplay');

		await onMatchWrite.run(paramsEvent({ seasonId: SEASON_ID, gameId: GAME_ID, order: '0' }));

		expect(replaySpy).not.toHaveBeenCalled();
	});

	// Three corrections to one night raise three of these. Before the ladder
	// lock each ran its own rewind-and-replay, and they interleaved.
	it('collapses a burst of corrections into a single replay', async () => {
		await setUpNight();
		await writeNightMatches([
			[2, 1],
			[3, 1],
			[1, 1],
		]);
		await finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID }, { uid: ADMIN }));

		await writeNightMatches([
			[0, 3],
			[1, 4],
			[1, 1],
		]);

		await Promise.all(
			['0', '1', '2'].map(order =>
				onMatchWrite.run(paramsEvent({ seasonId: SEASON_ID, gameId: GAME_ID, order }))
			)
		);

		// Whatever order they landed in, the ladder agrees with the scoreboard
		// — and each player moved exactly one night's worth, not three.
		for (const uid of TEAM_A) expect((await readUser(uid))?.rating).toMatchObject({ elo: 980, games: 1 });
		for (const uid of TEAM_B) expect((await readUser(uid))?.rating).toMatchObject({ elo: 1020, games: 1 });
	});
});
