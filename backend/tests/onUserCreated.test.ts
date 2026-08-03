import { onUserCreated } from '../src/onUserCreated';
import * as push from '../src/lib/push';
import { buildNewPlayerPush } from '../../shared/notifications';
import { aUser, clearAuth, clearFirestore, createdEvent, writeUser } from './helpers';

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
			buildNewPlayerPush({ uid: NEWCOMER, displayName: 'Zoe Lindqvist' }),
			'newPlayers'
		);
	});

	// `setAppAdmin` and the bootstrap script both write a whole profile, so
	// promoting a uid that had none creates one. Nobody joined — and whoever
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
