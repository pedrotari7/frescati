import { setPlayerTeam, setTeamLetter } from '../src/editLineup';
import type { TournamentTeams } from '../../shared/types';
import { BASE_ELO } from '../../shared/rating';
import {
	callRequest,
	clearAuth,
	clearFirestore,
	readTeams,
	writeGame,
	writeResponse,
	writeSeason,
	writeMatch,
	writeTeams,
	writeUser,
} from './helpers';

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';
const ADMIN = 'season-admin';

const asAdmin = (data: unknown) => callRequest(data, { uid: ADMIN });

const move = (uid: string, teamIndex: number | null) =>
	setPlayerTeam.run(asAdmin({ seasonId: SEASON_ID, gameId: GAME_ID, uid, teamIndex }));

const reletter = (from: number, to: number) =>
	setTeamLetter.run(asAdmin({ seasonId: SEASON_ID, gameId: GAME_ID, from, to }));

/** A game with two squads of two, everybody in and confirmed. */
const aTournament = async (extra: Partial<TournamentTeams> = {}) => {
	await writeSeason(SEASON_ID, { memberUids: ['anna', 'pedro', 'sofia', 'kalle'], adminUids: [ADMIN] });
	await writeGame(SEASON_ID, GAME_ID);

	for (const uid of ['anna', 'pedro', 'sofia', 'kalle']) {
		await writeResponse(SEASON_ID, GAME_ID, uid, { status: 'in', role: 'member' });
	}

	await writeTeams(
		SEASON_ID,
		GAME_ID,
		[
			['anna', 'pedro'],
			['sofia', 'kalle'],
		],
		{ elos: { anna: BASE_ELO, pedro: BASE_ELO, sofia: BASE_ELO, kalle: BASE_ELO }, ...extra }
	);
};

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

describe('setPlayerTeam', () => {
	it('rejects when nobody is signed in', async () => {
		await aTournament();

		await expect(
			setPlayerTeam.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID, uid: 'anna', teamIndex: 1 }))
		).rejects.toMatchObject({ code: 'unauthenticated' });
	});

	// The whole guarantee behind a function-owned lineup: a player cannot put
	// themselves on the side they fancy.
	it('rejects a player who is not a season admin', async () => {
		await aTournament();

		await expect(
			setPlayerTeam.run(
				callRequest({ seasonId: SEASON_ID, gameId: GAME_ID, uid: 'anna', teamIndex: 1 }, { uid: 'anna' })
			)
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('lets an app admin move somebody in a season they do not run', async () => {
		await aTournament();

		await setPlayerTeam.run(
			callRequest(
				{ seasonId: SEASON_ID, gameId: GAME_ID, uid: 'anna', teamIndex: 1 },
				{ uid: 'app-admin', admin: true }
			)
		);

		expect((await readTeams(SEASON_ID, GAME_ID))?.teams[1].uids).toContain('anna');
	});

	it.each([undefined, 'one', 1.5])('rejects %p as a team index', async teamIndex => {
		await aTournament();

		await expect(move('anna', teamIndex as number)).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	it('rejects a team that does not exist', async () => {
		await aTournament();

		await expect(move('anna', 3)).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	it('rejects a game with no lineup yet', async () => {
		await writeSeason(SEASON_ID, { adminUids: [ADMIN] });
		await writeGame(SEASON_ID, GAME_ID);

		await expect(move('anna', 0)).rejects.toMatchObject({ code: 'failed-precondition' });
	});

	it('moves a player between squads', async () => {
		await aTournament();

		await move('anna', 1);

		const lineup = await readTeams(SEASON_ID, GAME_ID);
		expect(lineup?.teams.map(team => team.uids)).toEqual([['pedro'], ['sofia', 'kalle', 'anna']]);
	});

	it('takes a player off the sheet', async () => {
		await aTournament();

		await move('anna', null);

		const lineup = await readTeams(SEASON_ID, GAME_ID);
		expect(lineup?.teams.map(team => team.uids)).toEqual([['pedro'], ['sofia', 'kalle']]);
	});

	it('puts somebody back on after they were taken off', async () => {
		await aTournament();

		await move('anna', null);
		await move('anna', 1);

		expect((await readTeams(SEASON_ID, GAME_ID))?.teams[1].uids).toEqual(['sofia', 'kalle', 'anna']);
	});

	// An empty squad is not a smaller squad: the rotation still pairs it up and
	// the table still ranks it.
	it('refuses to leave a squad with nobody on it', async () => {
		await aTournament();
		await move('pedro', 1);

		await expect(move('anna', 1)).rejects.toMatchObject({ code: 'failed-precondition' });
		expect((await readTeams(SEASON_ID, GAME_ID))?.teams[0].uids).toEqual(['anna']);
	});

	it('pins the lineup against the automatic rebuild, and signs it', async () => {
		await aTournament();

		await move('anna', 1);

		const lineup = await readTeams(SEASON_ID, GAME_ID);
		expect(lineup?.edited?.by).toBe(ADMIN);
		expect(lineup?.edited?.at).toEqual(expect.any(String));
	});

	it('leaves everything else on the lineup alone', async () => {
		await aTournament({ seed: 42, generation: 7 });

		await move('anna', 1);

		const lineup = await readTeams(SEASON_ID, GAME_ID);
		expect(lineup?.seed).toBe(42);
		expect(lineup?.generation).toBe(7);
		expect(lineup?.elos.pedro).toBe(BASE_ELO);
	});

	// The ledger was computed against this sheet and a replay reads it back.
	it('refuses to touch a confirmed game', async () => {
		await aTournament();
		await writeGame(SEASON_ID, GAME_ID, { resultFinalisedAt: '2026-09-01T20:00:00.000Z' });

		await expect(move('anna', 1)).rejects.toMatchObject({ code: 'failed-precondition' });
	});

	it('refuses to put somebody on a team who is not in for the game', async () => {
		await aTournament();
		await writeResponse(SEASON_ID, GAME_ID, 'ghost', { status: 'out', role: 'member' });

		await expect(move('ghost', 0)).rejects.toMatchObject({ code: 'failed-precondition' });
	});

	it('refuses an extra nobody has confirmed', async () => {
		await aTournament();
		await writeResponse(SEASON_ID, GAME_ID, 'guest', { status: 'in', role: 'extra' });

		await expect(move('guest', 0)).rejects.toMatchObject({ code: 'failed-precondition' });
	});

	// A pinned lineup stops being re-picked, so somebody who has tapped Out is
	// still on the sheet and still standing there in boots.
	it('still moves somebody already on the sheet who has since said out', async () => {
		await aTournament();
		await writeResponse(SEASON_ID, GAME_ID, 'anna', { status: 'out', role: 'member' });

		await move('anna', 1);

		expect((await readTeams(SEASON_ID, GAME_ID))?.teams[1].uids).toContain('anna');
	});

	// A real zero on the card would drag the squad average down with it.
	it('prices a player arriving on the sheet at what the optimizer would have paid', async () => {
		await aTournament();
		await writeUser('sofia', { rating: { elo: BASE_ELO + 200, games: 12, updatedAt: '2026-08-01T00:00:00.000Z' } });
		await writeUser('newcomer');
		await writeResponse(SEASON_ID, GAME_ID, 'newcomer', { status: 'in', role: 'member' });
		await writeSeason(SEASON_ID, {
			memberUids: ['anna', 'pedro', 'sofia', 'kalle', 'newcomer'],
			adminUids: [ADMIN],
		});

		await move('newcomer', 0);

		// Sofia is the season's only rated member, so she is the whole average an
		// unrated newcomer seeds at.
		expect((await readTeams(SEASON_ID, GAME_ID))?.elos.newcomer).toBe(BASE_ELO + 200);
	});
});

describe('setTeamLetter', () => {
	it('rejects a player who is not a season admin', async () => {
		await aTournament();

		await expect(
			setTeamLetter.run(callRequest({ seasonId: SEASON_ID, gameId: GAME_ID, from: 0, to: 1 }, { uid: 'anna' }))
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it.each([undefined, 'one', 1.5])('rejects %p as an index', async index => {
		await aTournament();

		await expect(reletter(0, index as number)).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	it('rejects a team that does not exist', async () => {
		await aTournament();

		await expect(reletter(0, 3)).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	it('rejects a game with no lineup yet', async () => {
		await writeSeason(SEASON_ID, { adminUids: [ADMIN] });
		await writeGame(SEASON_ID, GAME_ID);

		await expect(reletter(0, 1)).rejects.toMatchObject({ code: 'failed-precondition' });
	});

	// Which squad is A decides the running order: `getFixtures` pairs teams by
	// index and always opens A against B.
	it('swaps two squads over, letters and all', async () => {
		await aTournament();

		await reletter(0, 1);

		const lineup = await readTeams(SEASON_ID, GAME_ID);
		expect(lineup?.teams.map(team => team.uids)).toEqual([
			['sofia', 'kalle'],
			['anna', 'pedro'],
		]);
		expect(lineup?.teams.map(team => team.index)).toEqual([0, 1]);
	});

	it('pins the lineup like every other hand edit', async () => {
		await aTournament();

		await reletter(0, 1);

		expect((await readTeams(SEASON_ID, GAME_ID))?.edited?.by).toBe(ADMIN);
	});

	// A match stores the two indices it was played between, so a swap underneath
	// one hands a scoreline to a squad that never played it.
	it('refuses once anything has been scored', async () => {
		await aTournament();
		await writeMatch(SEASON_ID, GAME_ID, { order: 0, teamA: 0, teamB: 1, scoreA: 3, scoreB: 2 });

		await expect(reletter(0, 1)).rejects.toMatchObject({ code: 'failed-precondition' });
		expect((await readTeams(SEASON_ID, GAME_ID))?.teams[0].uids).toEqual(['anna', 'pedro']);
	});

	it('refuses to touch a confirmed game', async () => {
		await aTournament();
		await writeGame(SEASON_ID, GAME_ID, { resultFinalisedAt: '2026-09-01T20:00:00.000Z' });

		await expect(reletter(0, 1)).rejects.toMatchObject({ code: 'failed-precondition' });
	});
});
