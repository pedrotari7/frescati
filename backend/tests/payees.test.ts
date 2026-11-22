import { onPaymentWrite, syncSeasonPayees } from '../src/payees';
import { onSeasonWrite } from '../src/onSeasonWrite';
import {
	aSeason,
	clearAuth,
	clearFirestore,
	getDb,
	writeGame,
	writeResponse,
	writeSeason,
	writeUser,
	writtenEvent,
} from './helpers';
import type { Season } from '../../shared/types';

vi.mock('../src/lib/teams', () => ({ enqueueTeamRebuild: vi.fn().mockResolvedValue(undefined) }));

const ADMIN = 'a';
const OTHER = 'other-admin';
const PLAYER = 'player';

const savePayment = (uid: string, swish: string) =>
	getDb().doc(`users/${uid}/private/payment`).set({ swish, updatedAt: '2026-11-01T00:00:00.000Z' });

const fees = (payees: NonNullable<NonNullable<Season['fees']>['payees']>) => ({ total: 1000, perGame: 50, payees });

const readFees = async (seasonId: string) => ((await getDb().doc(`seasons/${seasonId}`).get()).data() as Season).fees;

const paymentEvent = (uid: string, after: boolean) =>
	writtenEvent({ uid }, undefined, after ? { swish: 'x' } : undefined);

beforeEach(async () => {
	await clearFirestore();
	await clearAuth();
	await writeUser(ADMIN, { isAppAdmin: true });
});

describe('onPaymentWrite', () => {
	it('copies the saved number onto every pot that names the admin', async () => {
		await writeSeason('s1', { fees: fees({ entry: { uid: ADMIN } }) });
		await writeSeason('s2', { fees: fees({ entry: { uid: ADMIN }, extras: { uid: ADMIN } }) });
		await writeSeason('s3', { fees: fees({ entry: { uid: OTHER } }) });
		await savePayment(ADMIN, '0701');

		await onPaymentWrite.run(paymentEvent(ADMIN, true));

		expect((await readFees('s1'))?.payees).toEqual({ entry: { uid: ADMIN, swish: '0701' } });
		expect((await readFees('s2'))?.payees).toEqual({
			entry: { uid: ADMIN, swish: '0701' },
			extras: { uid: ADMIN, swish: '0701' },
		});
		expect((await readFees('s3'))?.payees).toEqual({ entry: { uid: OTHER } });
	});

	it('removes the number, and keeps the uid, when the document is deleted', async () => {
		await writeSeason('s1', {
			fees: fees({ entry: { uid: ADMIN, swish: '0701' }, extras: { uid: ADMIN, swish: '0701' } }),
		});

		await onPaymentWrite.run(paymentEvent(ADMIN, false));

		expect((await readFees('s1'))?.payees).toEqual({ entry: { uid: ADMIN }, extras: { uid: ADMIN } });
	});

	it('never touches a custom number', async () => {
		await writeSeason('s1', { fees: fees({ entry: { swish: '0705' }, extras: { uid: ADMIN } }) });
		await savePayment(ADMIN, '0701');

		await onPaymentWrite.run(paymentEvent(ADMIN, true));

		expect((await readFees('s1'))?.payees).toEqual({
			entry: { swish: '0705' },
			extras: { uid: ADMIN, swish: '0701' },
		});
	});

	it('never publishes the number of somebody who is not an admin', async () => {
		await writeUser(PLAYER);
		await writeSeason('s1', { fees: fees({ entry: { uid: PLAYER, swish: '0709' } }) });
		await savePayment(PLAYER, '0709');

		await onPaymentWrite.run(paymentEvent(PLAYER, true));

		expect((await readFees('s1'))?.payees).toEqual({ entry: { uid: PLAYER } });
	});

	it('publishes the number of somebody who only administers another season', async () => {
		await writeUser(PLAYER);
		await writeSeason('other', { adminUids: [PLAYER] });
		await writeSeason('s1', { fees: fees({ entry: { uid: PLAYER } }) });
		await savePayment(PLAYER, '0709');

		await onPaymentWrite.run(paymentEvent(PLAYER, true));

		expect((await readFees('s1'))?.payees).toEqual({ entry: { uid: PLAYER, swish: '0709' } });
	});
});

describe('syncSeasonPayees', () => {
	it('fills in a season written naming an admin', async () => {
		await savePayment(ADMIN, '0701');
		const season = await writeSeason('s1', { fees: fees({ entry: { uid: ADMIN } }) });

		await syncSeasonPayees('s1', season);

		expect((await readFees('s1'))?.payees).toEqual({ entry: { uid: ADMIN, swish: '0701' } });
	});

	it('does not write a pot that is already in step', async () => {
		await savePayment(ADMIN, '0701');
		const season = await writeSeason('s1', {
			fees: fees({ entry: { uid: ADMIN, swish: '0701' }, extras: { swish: '0705' } }),
		});
		const before = (await getDb().doc('seasons/s1').get()).updateTime;

		await syncSeasonPayees('s1', season);

		expect((await getDb().doc('seasons/s1').get()).updateTime?.isEqual(before!)).toBe(true);
	});
});

describe('onSeasonWrite, publishing a number', () => {
	it('fills the number in on a season write', async () => {
		await savePayment(ADMIN, '0701');
		const after = await writeSeason('s1', { fees: fees({ entry: { uid: ADMIN } }) });

		await onSeasonWrite.run(writtenEvent({ seasonId: 's1' }, undefined, after));

		expect((await readFees('s1'))?.payees).toEqual({ entry: { uid: ADMIN, swish: '0701' } });
	});

	it('still recounts the roster when the sync throws', async () => {
		await savePayment(ADMIN, '0701');
		// No season document, so the sync's update fails with NOT_FOUND.
		const before = aSeason({ memberUids: ['m'] });
		const after = aSeason({ memberUids: ['m', 'n'], fees: fees({ entry: { uid: ADMIN } }) });
		await writeGame('season-1', 'g1', { kickoff: new Date(Date.now() + 86_400_000).toISOString() });
		await writeResponse('season-1', 'g1', 'n', { status: 'in', role: 'extra' });

		await onSeasonWrite.run(writtenEvent({ seasonId: 'season-1' }, before, after));

		const game = (await getDb().doc('seasons/season-1/games/g1').get()).data();
		expect(game?.counts.membersIn).toBe(1);
	});
});
