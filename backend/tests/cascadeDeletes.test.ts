import { onGameDeleted, onSeasonDeleted } from '../src/cascadeDeletes';
import { finaliseTournament } from '../src/finaliseTournament';
import {
	callRequest,
	clearAuth,
	clearFirestore,
	deletedEvent,
	getDb,
	paramsEvent,
	readRatingLedger,
	readUser,
	writeGame,
	writeMatch,
	writeResponse,
	writeSeason,
	writeTeams,
} from './helpers';

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const MEMBER = 'member-1';
const ADMIN = 'season-admin-1';

const TEAM_A = ['p1', 'p2', 'p3', 'p4'];
const TEAM_B = ['p5', 'p6', 'p7', 'p8'];

/**
 * What the ladder pays the winner of the one match these games actually play.
 *
 * A rating reads the scoreline as well as the result, so a 2-1 is four fifths
 * of the rate rather than all of it — `0.8 x (0.8 - 0.5) + 0.2 x 0.5`, at the
 * provisional K of 40 nobody here has played their way out of.
 */
const WON_2_1 = 13.6;

/** A rating, to the sixth decimal — that arithmetic is not exact in binary. */
const elo = (movement: number) => expect.closeTo(1000 + movement, 6);

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

describe('onGameDeleted', () => {
	it('cleans up everything left behind under the deleted game', async () => {
		await writeSeason(SEASON_ID);
		const game = await writeGame(SEASON_ID, GAME_ID);
		await writeResponse(SEASON_ID, GAME_ID, MEMBER);
		await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}/tournament/teams`).set({ teams: [] });

		// Firestore doesn't fire deletes for us here — the game document is
		// already gone by the time this trigger would run in production.
		await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}`).delete();

		await onGameDeleted.run(deletedEvent({ seasonId: SEASON_ID, gameId: GAME_ID }, game));

		const responseSnap = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}/responses/${MEMBER}`).get();
		const teamsSnap = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}/tournament/teams`).get();
		expect(responseSnap.exists).toBe(false);
		expect(teamsSnap.exists).toBe(false);
	});
});

/**
 * A deleted game's ledger entry lives outside the subtree `recursiveDelete`
 * walks, because ratings are global. Left alone it kept every player carrying
 * Elo from a game nobody could open, and kept counting towards the season table.
 */
describe('onGameDeleted, for a game that had been confirmed', () => {
	/** Confirms a two-team game that team A wins, and returns it as it stood. */
	const playAndConfirm = async (gameId: string, kickoff: string) => {
		await writeGame(SEASON_ID, gameId, { kickoff });
		await writeTeams(SEASON_ID, gameId, [TEAM_A, TEAM_B]);

		for (const [order, [scoreA, scoreB]] of (
			[
				[2, 1],
				[3, 1],
				[1, 1],
			] as [number, number][]
		).entries()) {
			await writeMatch(SEASON_ID, gameId, { order, teamA: 0, teamB: 1, scoreA, scoreB });
		}

		await finaliseTournament.run(callRequest({ seasonId: SEASON_ID, gameId }, { uid: ADMIN }));

		const snapshot = await getDb().doc(`seasons/${SEASON_ID}/games/${gameId}`).get();
		return snapshot.data();
	};

	const deleteGame = async (gameId: string, game: unknown) => {
		await getDb().doc(`seasons/${SEASON_ID}/games/${gameId}`).delete();
		await onGameDeleted.run(deletedEvent({ seasonId: SEASON_ID, gameId }, game));
	};

	beforeEach(async () => {
		await writeSeason(SEASON_ID, { memberUids: [...TEAM_A, ...TEAM_B], adminUids: [ADMIN] });
	});

	it('rewinds every rating the game moved', async () => {
		const game = await playAndConfirm(GAME_ID, '2026-09-01T17:00:00.000Z');

		// Team A won the one match a two-team rotation actually puts on — the
		// other two scorelines are at orders no rotation reaches, and
		// `selectPlayedMatches` drops them before anything is rated.
		expect((await readUser('p1'))?.rating).toMatchObject({ elo: elo(WON_2_1), games: 1 });
		expect((await readUser('p5'))?.rating).toMatchObject({ elo: elo(-WON_2_1), games: 1 });

		await deleteGame(GAME_ID, game);

		// Nobody had a rating before this game, so nobody has one after it goes
		// — restoring a stand-in would read as a real, settled rating.
		for (const uid of [...TEAM_A, ...TEAM_B]) expect((await readUser(uid))?.rating).toBeUndefined();
	});

	it('retires the ledger entry, so the season table stops counting the game', async () => {
		const game = await playAndConfirm(GAME_ID, '2026-09-01T17:00:00.000Z');
		expect(await readRatingLedger(GAME_ID)).toBeDefined();

		await deleteGame(GAME_ID, game);

		expect(await readRatingLedger(GAME_ID)).toBeUndefined();
	});

	it('re-rates every game played after it against the ratings it no longer produced', async () => {
		const first = await playAndConfirm(GAME_ID, '2026-09-01T17:00:00.000Z');
		await playAndConfirm('game-2', '2026-09-08T17:00:00.000Z');

		// Two games of the same result, the second rated off the first.
		expect((await readUser('p1'))?.rating).toMatchObject({ games: 2 });
		const before = (await readUser('p1'))!.rating!.elo;

		await deleteGame(GAME_ID, first);

		const after = await readUser('p1');
		// One game's worth of history left, and rated as if it were the only
		// one ever played rather than carrying the deleted game's Elo forward.
		expect(after?.rating).toMatchObject({ elo: elo(WON_2_1), games: 1 });
		expect(after!.rating!.elo).not.toBe(before);
		expect(await readRatingLedger('game-2')).toBeDefined();
	});

	it('leaves the ladder alone when the deleted game was never confirmed', async () => {
		await writeGame(SEASON_ID, GAME_ID);
		await writeTeams(SEASON_ID, GAME_ID, [TEAM_A, TEAM_B]);
		await writeMatch(SEASON_ID, GAME_ID, { order: 0, teamA: 0, teamB: 1, scoreA: 2, scoreB: 1 });

		const snapshot = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}`).get();
		await deleteGame(GAME_ID, snapshot.data());

		// Nothing was ever applied, so there is nothing to unwind.
		expect((await readUser('p1'))?.rating).toBeUndefined();
		expect(await readRatingLedger(GAME_ID)).toBeUndefined();
	});
});

describe('onSeasonDeleted', () => {
	it('cleans up every game and response left behind under the deleted season', async () => {
		await writeSeason(SEASON_ID);
		await writeGame(SEASON_ID, GAME_ID);
		await writeResponse(SEASON_ID, GAME_ID, MEMBER);

		await getDb().doc(`seasons/${SEASON_ID}`).delete();

		await onSeasonDeleted.run(paramsEvent({ seasonId: SEASON_ID }));

		const gameSnap = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}`).get();
		const responseSnap = await getDb().doc(`seasons/${SEASON_ID}/games/${GAME_ID}/responses/${MEMBER}`).get();
		expect(gameSnap.exists).toBe(false);
		expect(responseSnap.exists).toBe(false);
	});

	// The token itself sits under the season, so `recursiveDelete` reaches it —
	// but `calendarFeeds` is top-level on purpose, so nothing else would ever
	// take it with the rest.
	it('takes the calendar token and its reverse index with it', async () => {
		await writeSeason(SEASON_ID);
		await getDb()
			.doc(`seasons/${SEASON_ID}/calendar/token`)
			.set({ token: 'a-token', createdAt: '2026-08-01T00:00:00.000Z', createdBy: MEMBER });
		await getDb().doc('calendarFeeds/a-token').set({ seasonId: SEASON_ID, createdAt: '2026-08-01T00:00:00.000Z' });

		await getDb().doc(`seasons/${SEASON_ID}`).delete();

		await onSeasonDeleted.run(paramsEvent({ seasonId: SEASON_ID }));

		expect((await getDb().doc(`seasons/${SEASON_ID}/calendar/token`).get()).exists).toBe(false);
		expect((await getDb().doc('calendarFeeds/a-token').get()).exists).toBe(false);
	});

	it('does nothing extra when the season never had a calendar link', async () => {
		await writeSeason(SEASON_ID);

		await getDb().doc(`seasons/${SEASON_ID}`).delete();

		await expect(onSeasonDeleted.run(paramsEvent({ seasonId: SEASON_ID }))).resolves.not.toThrow();
	});
});
