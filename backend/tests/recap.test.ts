vi.mock('../src/lib/teams', () => ({ enqueueTeamRebuild: vi.fn().mockResolvedValue(undefined) }));

import { announceRecapIfReady } from '../src/lib/recap';
import { onGameWrite } from '../src/onGameWrite';
import * as push from '../src/lib/push';
import { aGame, clearAuth, clearFirestore, getDb, writeGame, writeSeason, writtenEvent } from './helpers';

const SEASON_ID = 'season-1';
const NOW = '2026-10-01T00:00:00.000Z';
const ENDED = '2020-09-01T18:30:00.000Z';

/** A rated game, with `uids` as the people who played in it. */
const writeLedger = (gameId: string, uids: string[]) =>
	getDb()
		.doc(`ratingLedger/${gameId}`)
		.set({
			seasonId: SEASON_ID,
			gameId,
			kickoff: '2020-09-01T17:00:00.000Z',
			kickoffMillis: Date.parse('2020-09-01T17:00:00.000Z'),
			finalisedAt: '2020-09-02T00:00:00.000Z',
			positions: Object.fromEntries(uids.map((uid, index) => [uid, index % 2])),
			before: {},
			after: {},
		});

const readStamp = async () => (await getDb().doc(`seasons/${SEASON_ID}`).get()).data()?.recapReadyAt;

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

afterEach(() => vi.restoreAllMocks());

describe('announceRecapIfReady', () => {
	it('stamps the season and tells everybody who played, once the last game is rated', async () => {
		await writeSeason(SEASON_ID, { name: 'Autumn 2020', memberUids: ['a', 'b', 'c'] });
		await writeGame(SEASON_ID, 'g1', { endsAt: ENDED, status: 'played' });
		await writeGame(SEASON_ID, 'g2', { endsAt: ENDED, status: 'played' });
		await writeLedger('g1', ['a', 'b']);
		await writeLedger('g2', ['b', 'x']);
		const send = vi.spyOn(push, 'sendRecapReady').mockResolvedValue({ pushed: 3, emailed: 0 });

		expect(await announceRecapIfReady(SEASON_ID, NOW)).toBe('announced');

		expect(await readStamp()).toBe(NOW);
		expect(send).toHaveBeenCalledTimes(1);
		// `c` is in the squad and never played; `x` played as an extra.
		expect([...send.mock.calls[0][0]].sort()).toEqual(['a', 'b', 'x']);
		expect(send.mock.calls[0][1]).toEqual({ seasonId: SEASON_ID, seasonName: 'Autumn 2020' });
	});

	it('says nothing a second time', async () => {
		await writeSeason(SEASON_ID);
		await writeGame(SEASON_ID, 'g1', { endsAt: ENDED, status: 'played' });
		await writeLedger('g1', ['a']);
		const send = vi.spyOn(push, 'sendRecapReady').mockResolvedValue({ pushed: 1, emailed: 0 });

		await announceRecapIfReady(SEASON_ID, NOW);

		expect(await announceRecapIfReady(SEASON_ID, '2026-10-02T00:00:00.000Z')).toBe('already');
		expect(await readStamp()).toBe(NOW);
		expect(send).toHaveBeenCalledTimes(1);
	});

	it('waits for a game that was played and never rated', async () => {
		await writeSeason(SEASON_ID);
		await writeGame(SEASON_ID, 'g1', { endsAt: ENDED, status: 'played' });
		await writeGame(SEASON_ID, 'g2', { endsAt: ENDED });
		await writeLedger('g1', ['a']);
		const send = vi.spyOn(push, 'sendRecapReady');

		expect(await announceRecapIfReady(SEASON_ID, NOW)).toBe('not-finished');
		expect(await readStamp()).toBeUndefined();
		expect(send).not.toHaveBeenCalled();
	});

	it('never finishes a season whose every game was called off', async () => {
		await writeSeason(SEASON_ID);
		await writeGame(SEASON_ID, 'g1', { endsAt: ENDED, status: 'cancelled' });
		const send = vi.spyOn(push, 'sendRecapReady');

		expect(await announceRecapIfReady(SEASON_ID, NOW)).toBe('not-finished');
		expect(send).not.toHaveBeenCalled();
	});

	it('has nothing to say about a season that is gone', async () => {
		expect(await announceRecapIfReady('no-such-season', NOW)).toBe('missing');
	});

	it('announces when the one game nobody scored is called off', async () => {
		await writeSeason(SEASON_ID, { memberUids: ['a'] });
		await writeGame(SEASON_ID, 'g1', { endsAt: ENDED, status: 'played' });
		await writeLedger('g1', ['a']);
		const unscored = await writeGame(SEASON_ID, 'g2', { endsAt: ENDED, status: 'cancelled' });
		vi.spyOn(push, 'sendGamePush').mockResolvedValue({ pushed: 0, emailed: 0 });
		const send = vi.spyOn(push, 'sendRecapReady').mockResolvedValue({ pushed: 1, emailed: 0 });

		await onGameWrite.run(
			writtenEvent({ seasonId: SEASON_ID, gameId: 'g2' }, aGame({ ...unscored, status: 'scheduled' }), unscored)
		);

		expect(await readStamp()).toBeDefined();
		expect(send).toHaveBeenCalledWith(['a'], expect.objectContaining({ seasonId: SEASON_ID }));
	});
});
