import { onUserCreated } from '../src/onUserCreated';
import * as push from '../src/lib/push';
import { buildNewPlayerPush } from '../../shared/notifications';
import { aUser, clearAuth, clearFirestore, createdEvent, writeSeason, writeUser } from './helpers';

const ADMIN = 'app-admin-1';
const OTHER_ADMIN = 'app-admin-2';
const PLAYER = 'player-1';
const NEWCOMER = 'newcomer-1';

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
});

// `jest.spyOn` reuses the same mock across calls on an already-spied method.
afterEach(() => jest.restoreAllMocks());

describe('onUserCreated', () => {
	it('tells every app admin, and nobody else', async () => {
		await writeUser(ADMIN, { isAppAdmin: true });
		await writeUser(OTHER_ADMIN, { isAppAdmin: true });
		await writeUser(PLAYER);
		const sendSpy = jest.spyOn(push, 'sendPush');

		await onUserCreated.run(createdEvent({ uid: NEWCOMER }, aUser(NEWCOMER, { displayName: 'Zoe Lindqvist' })));

		expect(sendSpy).toHaveBeenCalledWith(
			expect.arrayContaining([ADMIN, OTHER_ADMIN]),
			expect.objectContaining({ body: 'Zoe Lindqvist just signed into Frescati for the first time.' }),
			'newPlayers'
		);
		expect(sendSpy.mock.calls[0][0]).not.toContain(PLAYER);
	});

	it('sends the same payload the debug screen and the copy tests agree on', async () => {
		await writeUser(ADMIN, { isAppAdmin: true });
		const sendSpy = jest.spyOn(push, 'sendPush');

		await onUserCreated.run(createdEvent({ uid: NEWCOMER }, aUser(NEWCOMER, { displayName: 'Zoe Lindqvist' })));

		expect(sendSpy).toHaveBeenCalledWith(
			[ADMIN],
			buildNewPlayerPush({ uid: NEWCOMER, displayName: 'Zoe Lindqvist', seasonId: null }),
			'newPlayers'
		);
	});

	// The whole point of the notice: tapping it should drop an admin straight
	// onto the squad they'd add the newcomer to, not a screen they still have
	// to hunt from.
	it('deep-links to the manage-squad screen of the active season', async () => {
		await writeUser(ADMIN, { isAppAdmin: true });
		await writeSeason('season-active', { status: 'active' });
		const sendSpy = jest.spyOn(push, 'sendPush');

		await onUserCreated.run(createdEvent({ uid: NEWCOMER }, aUser(NEWCOMER)));

		expect(sendSpy.mock.calls[0][1]).toMatchObject({ url: '/s/season-active/admin/members' });
	});

	// Seasons can genuinely overlap, a Tuesday season and a Sunday offshoot
	// both active at once, so there is no single "the" season by construction.
	// Most recently created stands in for "the one an admin reached for last".
	it('picks the most recently created season when several are active', async () => {
		await writeUser(ADMIN, { isAppAdmin: true });
		await writeSeason('season-older', { status: 'active', createdAt: '2026-01-01T00:00:00.000Z' });
		await writeSeason('season-newer', { status: 'active', createdAt: '2026-06-01T00:00:00.000Z' });
		await writeSeason('season-archived', { status: 'archived', createdAt: '2026-09-01T00:00:00.000Z' });
		const sendSpy = jest.spyOn(push, 'sendPush');

		await onUserCreated.run(createdEvent({ uid: NEWCOMER }, aUser(NEWCOMER)));

		expect(sendSpy.mock.calls[0][1]).toMatchObject({ url: '/s/season-newer/admin/members' });
	});

	// Nothing to add them to yet, so back to the screen that lists everybody
	// who has ever signed in. The notice must not send an admin to a season
	// that has wound down.
	it('falls back to /admin when no season is active', async () => {
		await writeUser(ADMIN, { isAppAdmin: true });
		await writeSeason('season-archived', { status: 'archived' });
		const sendSpy = jest.spyOn(push, 'sendPush');

		await onUserCreated.run(createdEvent({ uid: NEWCOMER }, aUser(NEWCOMER)));

		expect(sendSpy.mock.calls[0][1]).toMatchObject({ url: '/admin' });
	});

	// `setAppAdmin` and the bootstrap script both write a whole profile, so
	// promoting a uid that had none creates one. Nobody joined, and whoever
	// did it is the person who would be told.
	it('ignores a profile created already carrying the admin badge', async () => {
		await writeUser(ADMIN, { isAppAdmin: true });
		const sendSpy = jest.spyOn(push, 'sendPush');

		await onUserCreated.run(createdEvent({ uid: OTHER_ADMIN }, aUser(OTHER_ADMIN, { isAppAdmin: true })));

		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('does not fall over when there are no admins to tell', async () => {
		await writeUser(PLAYER);

		await expect(onUserCreated.run(createdEvent({ uid: NEWCOMER }, aUser(NEWCOMER)))).resolves.toBeUndefined();
	});

	it('ignores an event with no document on it', async () => {
		await writeUser(ADMIN, { isAppAdmin: true });
		const sendSpy = jest.spyOn(push, 'sendPush');

		await onUserCreated.run(createdEvent({ uid: NEWCOMER }, undefined));

		expect(sendSpy).not.toHaveBeenCalled();
	});
});
