import { findTeamIndex, getUnassigned, withPlayerOn, wouldEmptyASquad } from './lineup';
import type { TournamentTeam } from './types';

const sheet = (...squads: string[][]): TournamentTeam[] => squads.map((uids, index) => ({ index, uids }));

describe('findTeamIndex', () => {
	it('finds the squad somebody is on', () => {
		expect(findTeamIndex(sheet(['anna', 'pedro'], ['sofia']), 'sofia')).toBe(1);
	});

	// Not a miss: somebody in the pool and on no squad is a state the sheet can
	// genuinely be in once an admin has taken them off it.
	it('answers -1 for somebody on no squad', () => {
		expect(findTeamIndex(sheet(['anna'], ['sofia']), 'pedro')).toBe(-1);
	});
});

describe('withPlayerOn', () => {
	it('moves somebody from one squad to another', () => {
		const moved = withPlayerOn(sheet(['anna', 'pedro'], ['sofia', 'kalle']), 'pedro', 1);

		expect(moved.map(team => team.uids)).toEqual([['anna'], ['sofia', 'kalle', 'pedro']]);
	});

	it('takes somebody off the sheet entirely', () => {
		const moved = withPlayerOn(sheet(['anna', 'pedro'], ['sofia']), 'pedro', null);

		expect(moved.map(team => team.uids)).toEqual([['anna'], ['sofia']]);
	});

	// The same write as a move, which is why it isn't its own function — and the
	// only way back for somebody who was taken off.
	it('adds somebody who was on no squad', () => {
		const moved = withPlayerOn(sheet(['anna'], ['sofia']), 'pedro', 0);

		expect(moved.map(team => team.uids)).toEqual([['anna', 'pedro'], ['sofia']]);
	});

	it('appends rather than reordering the squad they join', () => {
		const moved = withPlayerOn(sheet(['anna', 'pedro'], ['sofia', 'kalle']), 'anna', 1);

		expect(moved[1].uids).toEqual(['sofia', 'kalle', 'anna']);
	});

	it('keeps each squad on its own letter', () => {
		const moved = withPlayerOn(sheet(['anna'], ['sofia', 'kalle']), 'kalle', 0);

		expect(moved.map(team => team.index)).toEqual([0, 1]);
	});

	// A stale screen offering a team that has since gone must not silently drop
	// the player it was trying to move.
	it('leaves the sheet alone when the target squad does not exist', () => {
		const teams = sheet(['anna'], ['sofia']);

		expect(withPlayerOn(teams, 'anna', 3)).toBe(teams);
	});

	it('leaves the sheet alone when moving somebody to the squad they are on', () => {
		const moved = withPlayerOn(sheet(['anna', 'pedro'], ['sofia']), 'pedro', 0);

		expect(moved.map(team => team.uids)).toEqual([['anna', 'pedro'], ['sofia']]);
	});
});

describe('wouldEmptyASquad', () => {
	it('is true for the last player on a squad', () => {
		expect(wouldEmptyASquad(sheet(['anna', 'pedro'], ['sofia']), 'sofia')).toBe(true);
	});

	it('is false while somebody else is left behind', () => {
		expect(wouldEmptyASquad(sheet(['anna', 'pedro'], ['sofia']), 'anna')).toBe(false);
	});

	it('is false for somebody who is on no squad to begin with', () => {
		expect(wouldEmptyASquad(sheet(['anna'], ['sofia']), 'kalle')).toBe(false);
	});
});

describe('getUnassigned', () => {
	it('is empty when the sheet holds the whole pool', () => {
		expect(getUnassigned(sheet(['anna', 'pedro'], ['sofia']), ['anna', 'pedro', 'sofia'])).toEqual([]);
	});

	it('names whoever is in but on no team, in the order the pool gave them', () => {
		expect(getUnassigned(sheet(['anna'], ['sofia']), ['anna', 'kalle', 'sofia', 'pedro'])).toEqual([
			'kalle',
			'pedro',
		]);
	});

	// The other direction is somebody else's question: a player on the sheet who
	// has since dropped out is still on it, and this says nothing about them.
	it('ignores somebody on the sheet who is no longer in the pool', () => {
		expect(getUnassigned(sheet(['anna', 'pedro']), ['anna'])).toEqual([]);
	});
});
