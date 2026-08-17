import { main as pruneOrphans } from '../scripts/pruneOrphans';
import { main as recountGames } from '../scripts/recountGames';
import { main as stripUserEmails } from '../scripts/stripUserEmails';
import type { ScriptContext } from '../scripts/lib/script';
import {
	clearAuth,
	clearFirestore,
	getDb,
	readGame,
	readResponse,
	readUser,
	writeGame,
	writeResponse,
	writeSeason,
	writeUser,
} from './helpers';

/**
 * The three repairs that write against live data rather than reconstructing a
 * missing field.
 *
 * `prune-orphans` is the one with teeth — it deletes, recursively, on the basis
 * of a parent document being absent. Getting "absent" wrong there does not fail
 * loudly; it deletes a season's worth of answers that were fine. So most of its
 * tests are about what it must leave alone.
 */

const SEASON_ID = 'season-1';
const GAME_ID = 'game-1';

const context = ({ dryRun = false, args = [] as string[] } = {}): ScriptContext => ({
	db: getDb(),
	projectId: 'demo-frescati',
	dryRun,
	args,
});

const output = (): string => (console.log as jest.Mock).mock.calls.map(call => call.map(String).join(' ')).join('\n');

const exists = async (path: string): Promise<boolean> => (await getDb().doc(path).get()).exists;

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

describe('prune-orphans', () => {
	it('deletes responses left under a game that no longer exists', async () => {
		// Firestore does not delete subcollections with their parent, so every
		// game deleted before the cascade trigger existed left its answers
		// unreachable through the app but still returned by the collection-group
		// query behind "my answers".
		await writeSeason(SEASON_ID);
		await writeResponse(SEASON_ID, 'ghost-game', 'anna');

		await pruneOrphans(context());

		expect(await exists(`seasons/${SEASON_ID}/games/ghost-game/responses/anna`)).toBe(false);
	});

	it('deletes a game left under a season that no longer exists, and its answers with it', async () => {
		await writeGame('ghost-season', GAME_ID);
		await writeResponse('ghost-season', GAME_ID, 'anna');

		await pruneOrphans(context());

		expect(await exists(`seasons/ghost-season/games/${GAME_ID}`)).toBe(false);
		// recursiveDelete rather than a plain delete: an orphaned game has its
		// own orphaned responses hanging off it.
		expect(await exists(`seasons/ghost-season/games/${GAME_ID}/responses/anna`)).toBe(false);
	});

	it('leaves a healthy calendar completely alone', async () => {
		await writeSeason(SEASON_ID);
		await writeGame(SEASON_ID, GAME_ID);
		await writeResponse(SEASON_ID, GAME_ID, 'anna');

		await pruneOrphans(context());

		expect(await exists(`seasons/${SEASON_ID}/games/${GAME_ID}`)).toBe(true);
		expect(await exists(`seasons/${SEASON_ID}/games/${GAME_ID}/responses/anna`)).toBe(true);
		expect(output()).toContain('Nothing to do.');
	});

	it('writes nothing on a dry run', async () => {
		await writeSeason(SEASON_ID);
		await writeResponse(SEASON_ID, 'ghost-game', 'anna');

		await pruneOrphans(context({ dryRun: true }));

		expect(await exists(`seasons/${SEASON_ID}/games/ghost-game/responses/anna`)).toBe(true);
		expect(output()).toContain('Dry run, nothing written.');
	});
});

describe('recount-games', () => {
	it('rewrites counts that drifted from the answers behind them', async () => {
		await writeSeason(SEASON_ID, { memberUids: ['anna', 'bosse'] });
		// `counts` is function-owned and only recomputed on a response write, so
		// any change to how the tally works leaves stored totals reading whatever
		// they read at the time.
		await writeGame(SEASON_ID, GAME_ID, {
			counts: { membersIn: 99, membersOut: 0, extrasIn: 0, extrasOut: 0, extrasConfirmed: 0, playing: 99 },
		});
		await writeResponse(SEASON_ID, GAME_ID, 'anna', { status: 'in', role: 'member' });
		await writeResponse(SEASON_ID, GAME_ID, 'bosse', { status: 'out', role: 'member' });

		await recountGames(context());

		const game = await readGame(SEASON_ID, GAME_ID);
		expect(game?.counts.membersIn).toBe(1);
		expect(game?.counts.membersOut).toBe(1);
		expect(game?.counts.playing).toBe(1);
	});

	it('repairs a response whose role drifted from the roster', async () => {
		// A roster edit made before `onSeasonWrite` was deployed leaves somebody
		// answering as an extra who is now a member, which sorts them below every
		// member on the team sheet.
		await writeSeason(SEASON_ID, { memberUids: ['anna'] });
		await writeGame(SEASON_ID, GAME_ID);
		await writeResponse(SEASON_ID, GAME_ID, 'anna', { status: 'in', role: 'extra' });

		await recountGames(context());

		expect((await readResponse(SEASON_ID, GAME_ID, 'anna'))?.role).toBe('member');
	});

	it('writes the same answer when run twice', async () => {
		await writeSeason(SEASON_ID, { memberUids: ['anna'] });
		await writeGame(SEASON_ID, GAME_ID);
		await writeResponse(SEASON_ID, GAME_ID, 'anna', { status: 'in', role: 'member' });

		await recountGames(context());
		const once = await readGame(SEASON_ID, GAME_ID);

		await recountGames(context());

		expect((await readGame(SEASON_ID, GAME_ID))?.counts).toEqual(once?.counts);
	});
});

describe('strip-user-emails', () => {
	it('removes an address from a profile every signed-in player can read', async () => {
		// `users/{uid}` is readable by everybody, which is what makes rosters and
		// the member picker work — so a mirrored address is a group-wide address
		// book. Firebase Auth is the only place one belongs.
		await writeUser('anna', { email: 'anna@example.test' } as Partial<Parameters<typeof writeUser>[1]>);

		await stripUserEmails(context());

		expect(await readUser('anna')).not.toHaveProperty('email');
	});

	it('leaves the rest of the profile intact', async () => {
		await writeUser('anna', {
			displayName: 'Anna',
			email: 'anna@example.test',
		} as Partial<Parameters<typeof writeUser>[1]>);

		await stripUserEmails(context());

		expect((await readUser('anna'))?.displayName).toBe('Anna');
	});

	it('skips profiles that never carried one', async () => {
		await writeUser('anna');

		await stripUserEmails(context());

		expect(output()).toContain('Nothing to do.');
	});

	it('writes nothing on a dry run', async () => {
		await writeUser('anna', { email: 'anna@example.test' } as Partial<Parameters<typeof writeUser>[1]>);

		await stripUserEmails(context({ dryRun: true }));

		expect(await readUser('anna')).toHaveProperty('email');
		expect(output()).toContain('Dry run, nothing written.');
	});
});
