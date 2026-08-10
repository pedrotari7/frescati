import { setStartingRating } from '../src/setStartingRating';
import { fromDisplayRating, toDisplayRating } from '../../shared/rating';
import {
	callRequest,
	clearAuth,
	clearFirestore,
	readGame,
	readUser,
	writeGame,
	writeResponse,
	writeSeason,
	writeUser,
} from './helpers';

const CALLER = 'app-admin-1';
const TARGET = 'target-1';
const SEASON_ID = 'season-1';

const asAdmin = (data: unknown) => callRequest(data, { uid: CALLER, admin: true });

/** Somewhere in the past — every helper game kicks off in September 2026. */
const PLAYED = '2020-09-01T17:00:00.000Z';

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

describe('setStartingRating', () => {
	it('rejects when nobody is signed in', async () => {
		await expect(setStartingRating.run(callRequest({ uid: TARGET, rating: 70 }))).rejects.toMatchObject({
			code: 'unauthenticated',
		});
	});

	it('rejects a caller who is not an app admin', async () => {
		await expect(
			setStartingRating.run(callRequest({ uid: TARGET, rating: 70 }, { uid: CALLER, admin: false }))
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('rejects a request with no uid', async () => {
		await expect(setStartingRating.run(asAdmin({ rating: 70 }))).rejects.toMatchObject({
			code: 'invalid-argument',
		});
	});

	// Clamping would store 100 and let a broken caller look like it worked.
	it.each([140, -1, Number.NaN, 'seventy', undefined])('rejects %p as a rating', async rating => {
		await writeUser(TARGET);

		await expect(setStartingRating.run(asAdmin({ uid: TARGET, rating }))).rejects.toMatchObject({
			code: 'invalid-argument',
		});
	});

	it('rejects a player with no profile', async () => {
		await expect(setStartingRating.run(asAdmin({ uid: 'ghost', rating: 70 }))).rejects.toMatchObject({
			code: 'not-found',
		});
	});

	it('stores the Elo behind the number the admin was shown', async () => {
		await writeUser(TARGET);

		await setStartingRating.run(asAdmin({ uid: TARGET, rating: 70 }));

		const rating = (await readUser(TARGET))?.rating;
		expect(rating?.elo).toBe(fromDisplayRating(70));
		expect(toDisplayRating(rating!.elo)).toBe(70);
	});

	// Zero games is what keeps them off the ladder, keeps the provisional
	// K-factor on them, and keeps this editable until they play.
	it('records no games behind a starting rating', async () => {
		await writeUser(TARGET);

		await setStartingRating.run(asAdmin({ uid: TARGET, rating: 70 }));

		expect((await readUser(TARGET))?.rating?.games).toBe(0);
	});

	it('leaves the rest of the profile alone', async () => {
		await writeUser(TARGET, { displayName: 'Nova' });

		await setStartingRating.run(asAdmin({ uid: TARGET, rating: 30 }));

		expect(await readUser(TARGET)).toMatchObject({ uid: TARGET, displayName: 'Nova', isAppAdmin: false });
	});

	it('lets an admin change their mind before the first game', async () => {
		await writeUser(TARGET);

		await setStartingRating.run(asAdmin({ uid: TARGET, rating: 70 }));
		await setStartingRating.run(asAdmin({ uid: TARGET, rating: 40 }));

		expect(toDisplayRating((await readUser(TARGET))!.rating!.elo)).toBe(40);
	});

	// Back to no rating at all, not to a stored 50 — the seed is the group
	// average, and a placeholder would read as a settled estimate of average.
	it('clears the rating outright rather than resetting it to the middle', async () => {
		await writeUser(TARGET, { rating: { elo: 1150, games: 0, updatedAt: PLAYED } });

		await setStartingRating.run(asAdmin({ uid: TARGET, rating: null }));

		expect(await readUser(TARGET)).not.toHaveProperty('rating');
	});

	/**
	 * The rule the whole design rests on. Every ledger entry records what each
	 * player carried into that game, and a replay restores those on the way
	 * past — so an edit dropped on top of an earned rating would be undone by
	 * the next correction anybody made, silently and much later.
	 */
	it('refuses a player who has already been rated', async () => {
		await writeUser(TARGET, { rating: { elo: 1100, games: 1, updatedAt: PLAYED } });

		await expect(setStartingRating.run(asAdmin({ uid: TARGET, rating: 90 }))).rejects.toMatchObject({
			code: 'failed-precondition',
		});

		expect((await readUser(TARGET))?.rating?.elo).toBe(1100);
	});

	it('refuses to clear a rating that was earned', async () => {
		await writeUser(TARGET, { rating: { elo: 1100, games: 1, updatedAt: PLAYED } });

		await expect(setStartingRating.run(asAdmin({ uid: TARGET, rating: null }))).rejects.toMatchObject({
			code: 'failed-precondition',
		});
	});
});

/**
 * A lineup already built for an upcoming game was picked with this player worth
 * the season seed. Without the bump the balancer keeps using the old number
 * until somebody else happens to answer, which reads exactly like the rating
 * having been ignored.
 */
describe('setStartingRating, and the lineups it invalidates', () => {
	beforeEach(async () => {
		await writeSeason(SEASON_ID, { memberUids: [TARGET] });
		await writeUser(TARGET);
	});

	const generation = async (gameId: string) => (await readGame(SEASON_ID, gameId))?.teamsGeneration;

	it('marks an upcoming game they said In to for re-picking', async () => {
		await writeGame(SEASON_ID, 'game-1', { teamsGeneration: 3 });
		await writeResponse(SEASON_ID, 'game-1', TARGET, { status: 'in' });

		await setStartingRating.run(asAdmin({ uid: TARGET, rating: 80 }));

		expect(await generation('game-1')).toBe(4);
	});

	it('leaves a game they said Out to alone', async () => {
		await writeGame(SEASON_ID, 'game-2', { teamsGeneration: 3 });
		await writeResponse(SEASON_ID, 'game-2', TARGET, { status: 'out' });

		await setStartingRating.run(asAdmin({ uid: TARGET, rating: 80 }));

		expect(await generation('game-2')).toBe(3);
	});

	// A played game is a record of what happened, and rewriting its lineup
	// would rewrite what the result meant.
	it('leaves a game that has already kicked off alone', async () => {
		await writeGame(SEASON_ID, 'game-3', { kickoff: PLAYED, teamsGeneration: 3 });
		await writeResponse(SEASON_ID, 'game-3', TARGET, { status: 'in' });

		await setStartingRating.run(asAdmin({ uid: TARGET, rating: 80 }));

		expect(await generation('game-3')).toBe(3);
	});

	// The ledger was computed against that lineup, and a replay reads it back.
	it('leaves a confirmed game alone', async () => {
		await writeGame(SEASON_ID, 'game-4', { teamsGeneration: 3, resultFinalisedAt: '2026-08-05T10:00:00.000Z' });
		await writeResponse(SEASON_ID, 'game-4', TARGET, { status: 'in' });

		await setStartingRating.run(asAdmin({ uid: TARGET, rating: 80 }));

		expect(await generation('game-4')).toBe(3);
	});

	it('does nothing to games somebody else answered', async () => {
		await writeGame(SEASON_ID, 'game-5', { teamsGeneration: 3 });
		await writeResponse(SEASON_ID, 'game-5', 'somebody-else', { status: 'in' });

		await setStartingRating.run(asAdmin({ uid: TARGET, rating: 80 }));

		expect(await generation('game-5')).toBe(3);
	});
});
