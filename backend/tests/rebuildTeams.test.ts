import { runTeamRebuild } from '../src/lib/rebuild';
import { rebuildTeams } from '../src/rebuildTeams';
import { getSeed, pickTeams } from '../../shared/optimizer';
import { getSquadSizes, getTeamCount } from '../../shared/tournament';
import { getElo, getSeedElo } from '../../shared/rating';
import {
	clearAuth,
	clearFirestore,
	readTeams,
	taskRequest,
	writeGame,
	writeResponse,
	writeSeason,
	writeTeams,
} from './helpers';

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';

const uids = (count: number): string[] => Array.from({ length: count }, (_, index) => `p${index + 1}`);

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

describe('runTeamRebuild', () => {
	it('builds a lineup for a confirmed pool that clears the tournament floor', async () => {
		const players = uids(8);
		await writeSeason(SEASON_ID, { memberUids: players });
		await writeGame(SEASON_ID, GAME_ID, { teamsGeneration: 1 });
		for (const uid of players) await writeResponse(SEASON_ID, GAME_ID, uid, { status: 'in', role: 'member' });

		await runTeamRebuild({ seasonId: SEASON_ID, gameId: GAME_ID, generation: 1 });

		const lineup = await readTeams(SEASON_ID, GAME_ID);
		expect(lineup).toBeDefined();
		expect(lineup?.generation).toBe(1);
		expect(lineup?.teams).toHaveLength(2);
		expect(lineup?.teams.flatMap(team => team.uids).sort()).toEqual([...players].sort());
		for (const uid of players) expect(lineup?.elos[uid]).toBe(getSeedElo([]));

		// `pickTeams` is pure and seeded, so the exact split this pool produces is
		// predictable — worth pinning down once so a change to the optimizer's
		// wiring here doesn't go unnoticed.
		const seed = getSeed(GAME_ID, 0);
		const expected = pickTeams({
			players: players.map(uid => ({ uid, elo: getElo(undefined, getSeedElo([])) })),
			squadSizes: getSquadSizes(8, getTeamCount(8)),
			seed,
			settings: { randomness: 0.3, repeatPenalty: 0.4, repeatLookback: 4, matchMinutes: 5 },
			history: [],
		});
		expect(lineup?.teams).toEqual(expected);
	});

	it('excludes an unconfirmed extra from the pool', async () => {
		const members = uids(7);
		await writeSeason(SEASON_ID, { memberUids: members });
		await writeGame(SEASON_ID, GAME_ID, { teamsGeneration: 1 });
		for (const uid of members) await writeResponse(SEASON_ID, GAME_ID, uid, { status: 'in', role: 'member' });
		await writeResponse(SEASON_ID, GAME_ID, 'extra-1', { status: 'in', role: 'extra' });

		await runTeamRebuild({ seasonId: SEASON_ID, gameId: GAME_ID, generation: 1 });

		// Seven confirmed members plus one undecided extra is still below the
		// eight-player floor, so no lineup should appear yet.
		expect(await readTeams(SEASON_ID, GAME_ID)).toBeUndefined();

		await writeResponse(SEASON_ID, GAME_ID, 'extra-1', { status: 'in', role: 'extra', confirmOverride: true });
		await runTeamRebuild({ seasonId: SEASON_ID, gameId: GAME_ID, generation: 1 });

		const lineup = await readTeams(SEASON_ID, GAME_ID);
		expect(lineup?.teams.flatMap(team => team.uids).sort()).toEqual([...members, 'extra-1'].sort());
	});

	it('clears an existing lineup once the pool drops below the tournament floor', async () => {
		const players = uids(8);
		await writeSeason(SEASON_ID, { memberUids: players });
		await writeGame(SEASON_ID, GAME_ID, { teamsGeneration: 2 });
		await writeTeams(SEASON_ID, GAME_ID, [players.slice(0, 4), players.slice(4)]);
		for (const uid of players.slice(0, 5))
			await writeResponse(SEASON_ID, GAME_ID, uid, { status: 'in', role: 'member' });

		await runTeamRebuild({ seasonId: SEASON_ID, gameId: GAME_ID, generation: 2 });

		expect(await readTeams(SEASON_ID, GAME_ID)).toBeUndefined();
	});

	it('does nothing when the game no longer exists', async () => {
		await expect(
			runTeamRebuild({ seasonId: SEASON_ID, gameId: 'ghost-game', generation: 1 })
		).resolves.toBeUndefined();
	});

	it('leaves a confirmed game’s lineup alone', async () => {
		const players = uids(8);
		await writeSeason(SEASON_ID, { memberUids: players });
		await writeGame(SEASON_ID, GAME_ID, { teamsGeneration: 3, resultFinalisedAt: '2026-09-01T21:00:00.000Z' });
		const frozen = await writeTeams(SEASON_ID, GAME_ID, [players.slice(0, 4), players.slice(4)], { generation: 3 });
		for (const uid of players) await writeResponse(SEASON_ID, GAME_ID, uid, { status: 'in', role: 'member' });

		await runTeamRebuild({ seasonId: SEASON_ID, gameId: GAME_ID, generation: 3 });

		expect(await readTeams(SEASON_ID, GAME_ID)).toEqual(frozen);
	});

	// An admin standing at the pitch knows something the optimizer doesn't, and
	// the next person to change their mind must not undo it.
	it('leaves a hand-picked lineup alone', async () => {
		const players = uids(8);
		await writeSeason(SEASON_ID, { memberUids: players });
		await writeGame(SEASON_ID, GAME_ID, { teamsGeneration: 3 });
		const pinned = await writeTeams(SEASON_ID, GAME_ID, [players.slice(0, 4), players.slice(4)], {
			generation: 3,
			edited: { by: 'season-admin', at: '2026-09-01T17:05:00.000Z' },
		});
		for (const uid of players) await writeResponse(SEASON_ID, GAME_ID, uid, { status: 'in', role: 'member' });

		await runTeamRebuild({ seasonId: SEASON_ID, gameId: GAME_ID, generation: 3 });

		expect(await readTeams(SEASON_ID, GAME_ID)).toEqual(pinned);
	});

	// Which is also why it must not be cleared out from under them when the pool
	// drops below the tournament floor.
	it('keeps a hand-picked lineup even when the pool falls short of a tournament', async () => {
		const players = uids(8);
		await writeSeason(SEASON_ID, { memberUids: players });
		await writeGame(SEASON_ID, GAME_ID, { teamsGeneration: 3 });
		await writeTeams(SEASON_ID, GAME_ID, [players.slice(0, 4), players.slice(4)], {
			generation: 3,
			edited: { by: 'season-admin', at: '2026-09-01T17:05:00.000Z' },
		});
		await writeResponse(SEASON_ID, GAME_ID, players[0], { status: 'in', role: 'member' });

		await runTeamRebuild({ seasonId: SEASON_ID, gameId: GAME_ID, generation: 3 });

		expect(await readTeams(SEASON_ID, GAME_ID)).toBeDefined();
	});

	// Reshuffle already means "re-pick these teams", so it is the way back.
	it('re-picks a hand-picked lineup when the rebuild was asked for', async () => {
		const players = uids(8);
		await writeSeason(SEASON_ID, { memberUids: players });
		await writeGame(SEASON_ID, GAME_ID, { teamsGeneration: 3, reshuffleCount: 1 });
		await writeTeams(SEASON_ID, GAME_ID, [players.slice(0, 4), players.slice(4)], {
			generation: 3,
			edited: { by: 'season-admin', at: '2026-09-01T17:05:00.000Z' },
		});
		for (const uid of players) await writeResponse(SEASON_ID, GAME_ID, uid, { status: 'in', role: 'member' });

		await runTeamRebuild({ seasonId: SEASON_ID, gameId: GAME_ID, generation: 3, force: true });

		expect((await readTeams(SEASON_ID, GAME_ID))?.edited).toBeUndefined();
	});

	it('skips a rebuild superseded by a later response', async () => {
		const players = uids(8);
		await writeSeason(SEASON_ID, { memberUids: players });
		await writeGame(SEASON_ID, GAME_ID, { teamsGeneration: 5 });
		for (const uid of players) await writeResponse(SEASON_ID, GAME_ID, uid, { status: 'in', role: 'member' });

		await runTeamRebuild({ seasonId: SEASON_ID, gameId: GAME_ID, generation: 3 });

		expect(await readTeams(SEASON_ID, GAME_ID)).toBeUndefined();
	});
});

describe('rebuildTeams (task wrapper)', () => {
	it('delegates straight through to runTeamRebuild', async () => {
		const players = uids(8);
		await writeSeason(SEASON_ID, { memberUids: players });
		await writeGame(SEASON_ID, GAME_ID, { teamsGeneration: 1 });
		for (const uid of players) await writeResponse(SEASON_ID, GAME_ID, uid, { status: 'in', role: 'member' });

		await rebuildTeams.run(taskRequest({ seasonId: SEASON_ID, gameId: GAME_ID, generation: 1 }));

		const lineup = await readTeams(SEASON_ID, GAME_ID);
		expect(lineup?.teams).toHaveLength(2);
	});
});
