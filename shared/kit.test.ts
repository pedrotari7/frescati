import { findStrandedKit, getKitGaps, getKitStatus, sortKitItems } from './kit';
import type { GameResponse, KitItem, KitKind } from './types';

const item = (id: string, kind: KitKind, holderUid: string, name = id): KitItem => ({
	id,
	name,
	kind,
	holderUid,
	updatedBy: holderUid,
	updatedAt: '2026-08-01T00:00:00.000Z',
});

const answer = (uid: string, status: 'in' | 'out'): Pick<GameResponse, 'uid' | 'status'> => ({ uid, status });

describe('getKitStatus', () => {
	it('is covered when the holder is playing', () => {
		const [ball] = getKitStatus([item('ball-1', 'ball', 'anna')], [answer('anna', 'in')]);

		expect(ball.coverage).toBe('covered');
		expect(ball.bringing.map(kit => kit.id)).toEqual(['ball-1']);
	});

	it('is missing when every holder has said they are out', () => {
		const [ball] = getKitStatus(
			[item('ball-1', 'ball', 'anna'), item('ball-2', 'ball', 'pedro')],
			[answer('anna', 'out'), answer('pedro', 'out')]
		);

		expect(ball.coverage).toBe('missing');
		expect(ball.bringing).toEqual([]);
	});

	// The third state, and the reason it exists: nobody has said no yet.
	it('is unknown when a holder has not answered at all', () => {
		const [ball] = getKitStatus([item('ball-1', 'ball', 'anna')], []);

		expect(ball.coverage).toBe('unknown');
	});

	it('prefers a confirmed yes over an outstanding answer', () => {
		const [ball] = getKitStatus(
			[item('ball-1', 'ball', 'anna'), item('ball-2', 'ball', 'pedro')],
			[answer('anna', 'in')]
		);

		expect(ball.coverage).toBe('covered');
	});

	// One ball is a ball. The whole reason items carry a kind rather than each
	// standing alone is that they substitute for each other.
	it('needs only one item of a kind to be coming', () => {
		const [ball] = getKitStatus(
			[item('ball-1', 'ball', 'anna'), item('ball-2', 'ball', 'pedro')],
			[answer('anna', 'in'), answer('pedro', 'out')]
		);

		expect(ball.coverage).toBe('covered');
		expect(ball.items).toHaveLength(2);
		expect(ball.bringing.map(kit => kit.id)).toEqual(['ball-1']);
	});

	it('reports each kind separately', () => {
		const statuses = getKitStatus(
			[item('ball-1', 'ball', 'anna'), item('vests-1', 'vests', 'pedro')],
			[answer('anna', 'in'), answer('pedro', 'out')]
		);

		expect(statuses.map(status => [status.kind, status.coverage])).toEqual([
			['ball', 'covered'],
			['vests', 'missing'],
		]);
	});

	it('leaves out kinds the season owns nothing of', () => {
		const statuses = getKitStatus([item('ball-1', 'ball', 'anna')], [answer('anna', 'in')]);

		expect(statuses.map(status => status.kind)).toEqual(['ball']);
	});

	it('has nothing to say about a season with no kit at all', () => {
		expect(getKitStatus([], [answer('anna', 'in')])).toEqual([]);
	});

	// Confirmation decides whether an extra counts towards the headcount. The
	// bag in their hallway is coming either way.
	it('counts an unconfirmed extra who is holding something', () => {
		const [ball] = getKitStatus([item('ball-1', 'ball', 'guest')], [answer('guest', 'in')]);

		expect(ball.coverage).toBe('covered');
	});

	it('lists kinds and items in a stable order whatever order they arrived in', () => {
		const forwards = getKitStatus(
			[item('vests-1', 'vests', 'anna', 'Blue vests'), item('ball-2', 'ball', 'anna', 'Spare ball')],
			[]
		);
		const backwards = getKitStatus(
			[item('ball-2', 'ball', 'anna', 'Spare ball'), item('vests-1', 'vests', 'anna', 'Blue vests')],
			[]
		);

		expect(forwards.map(status => status.kind)).toEqual(['ball', 'vests']);
		expect(forwards).toEqual(backwards);
	});
});

describe('getKitGaps', () => {
	const gaps = (items: KitItem[], responses: Pick<GameResponse, 'uid' | 'status'>[]) =>
		getKitGaps(getKitStatus(items, responses)).map(status => status.kind);

	it('reports a required kind nobody is bringing', () => {
		expect(gaps([item('vests-1', 'vests', 'pedro')], [answer('pedro', 'out')])).toEqual(['vests']);
	});

	it('reports a required kind whose holder has gone quiet', () => {
		expect(gaps([item('ball-1', 'ball', 'anna')], [])).toEqual(['ball']);
	});

	it('says nothing when everything required is covered', () => {
		expect(
			gaps([item('ball-1', 'ball', 'anna'), item('vests-1', 'vests', 'anna')], [answer('anna', 'in')])
		).toEqual([]);
	});

	// You can only be missing something you have — a group that has never owned
	// vests is not short of them.
	it('says nothing about a kind the season owns none of', () => {
		expect(gaps([item('ball-1', 'ball', 'anna')], [answer('anna', 'in')])).toEqual([]);
	});

	it('never warns about other kit, however it is answered', () => {
		expect(gaps([item('pump', 'other', 'pedro')], [answer('pedro', 'out')])).toEqual([]);
	});
});

describe('sortKitItems', () => {
	it('orders by kind, then name, then id', () => {
		const sorted = sortKitItems([
			item('z', 'vests', 'anna', 'Blue vests'),
			item('b', 'ball', 'anna', 'Spare ball'),
			item('a', 'ball', 'anna', 'Match ball'),
		]);

		expect(sorted.map(kit => kit.id)).toEqual(['a', 'b', 'z']);
	});

	it('does not mutate what it was given', () => {
		const items = [item('z', 'vests', 'anna'), item('a', 'ball', 'anna')];
		sortKitItems(items);

		expect(items.map(kit => kit.id)).toEqual(['z', 'a']);
	});
});

describe('findStrandedKit', () => {
	it('finds kit held by somebody who has left the squad', () => {
		const stranded = findStrandedKit([item('ball-1', 'ball', 'anna'), item('vests-1', 'vests', 'gone')], ['anna']);

		expect(stranded.map(kit => kit.id)).toEqual(['vests-1']);
	});

	it('finds nothing when every holder is still in the squad', () => {
		expect(findStrandedKit([item('ball-1', 'ball', 'anna')], ['anna', 'pedro'])).toEqual([]);
	});
});
