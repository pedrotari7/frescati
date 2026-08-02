import { getMatchPoints, getPositions, getStandings } from './standings';
import type { TournamentMatch } from './types';

const match = (order: number, teamA: number, teamB: number, scoreA: number, scoreB: number): TournamentMatch => ({
	order,
	teamA,
	teamB,
	scoreA,
	scoreB,
	updatedBy: 'someone',
	updatedAt: '2026-09-01T18:00:00.000Z',
});

const positionsOf = (teamCount: number, matches: TournamentMatch[]) => getPositions(getStandings(teamCount, matches));

describe('getMatchPoints', () => {
	it.each([
		[3, 1, [3, 0]],
		[1, 3, [0, 3]],
		[2, 2, [1, 1]],
		[0, 0, [1, 1]],
	])('%i–%i pays %j', (scoreA, scoreB, expected) => {
		expect(getMatchPoints(scoreA, scoreB)).toEqual(expected);
	});
});

describe('getStandings', () => {
	it('gives every team a row even before anything is played', () => {
		const rows = getStandings(4, []);

		expect(rows).toHaveLength(4);
		expect(rows.every(row => row.played === 0 && row.position === 0)).toBe(true);
	});

	it('tallies wins, draws, losses and goals', () => {
		const rows = getStandings(2, [match(0, 0, 1, 3, 1), match(1, 0, 1, 2, 2)]);
		const [teamA, teamB] = rows.sort((a, b) => a.team - b.team);

		expect(teamA).toMatchObject({
			played: 2,
			won: 1,
			drawn: 1,
			lost: 0,
			goalsFor: 5,
			goalsAgainst: 3,
			goalDifference: 2,
			points: 4,
		});
		expect(teamB).toMatchObject({ played: 2, won: 0, drawn: 1, lost: 1, points: 1 });
	});

	it('orders by points', () => {
		// A beats B, A beats C, B beats C.
		const matches = [match(0, 0, 1, 1, 0), match(1, 0, 2, 1, 0), match(2, 1, 2, 1, 0)];

		expect(positionsOf(3, matches)).toEqual([0, 1, 2]);
	});

	it('separates teams level on points by their head-to-head', () => {
		// A full four-team round robin. A and B both finish on six points from
		// three games; B beat A; A has a goal difference of +9 against B's +1.
		const matches = [
			match(0, 0, 1, 0, 1),
			match(1, 2, 3, 0, 0),
			match(2, 0, 2, 5, 0),
			match(3, 1, 3, 1, 0),
			match(4, 0, 3, 5, 0),
			match(5, 1, 2, 0, 1),
		];
		const rows = getStandings(4, matches).sort((a, b) => a.position - b.position);

		expect(rows[0]).toMatchObject({ team: 1, points: 6 });
		expect(rows[1]).toMatchObject({ team: 0, points: 6, goalDifference: 9 });
	});

	it('falls through to goal difference when the head-to-head was a draw', () => {
		const matches = [match(0, 0, 1, 1, 1), match(1, 0, 2, 4, 0), match(2, 1, 2, 1, 0)];
		const rows = getStandings(3, matches).sort((a, b) => a.position - b.position);

		expect(rows[0].team).toBe(0);
		expect(rows[1].team).toBe(1);
	});

	it('falls through to goals scored when the goal difference matches too', () => {
		// A and B draw with each other and each beat C by one. Same points, same
		// goal difference, same head-to-head — only the goals scored differ.
		const matches = [match(0, 0, 1, 1, 1), match(1, 0, 2, 3, 2), match(2, 1, 2, 2, 1)];
		const rows = getStandings(3, matches).sort((a, b) => a.position - b.position);

		expect(rows[0]).toMatchObject({ team: 0, points: 4, goalDifference: 1, goalsFor: 4 });
		expect(rows[1]).toMatchObject({ team: 1, points: 4, goalDifference: 1, goalsFor: 3 });
	});

	it('shares a position when nothing separates two teams at all', () => {
		// A mirror image: both drew with each other and beat nobody.
		expect(positionsOf(2, [match(0, 0, 1, 2, 2)])).toEqual([0, 0]);
	});

	it('shares first place across a three-way deadlock', () => {
		const matches = [match(0, 0, 1, 1, 1), match(1, 1, 2, 1, 1), match(2, 2, 0, 1, 1)];

		expect(positionsOf(3, matches)).toEqual([0, 0, 0]);
	});

	it('leaves a gap after a shared position, so the places a tie covers are used up', () => {
		// A and B are identical and both above C.
		const matches = [match(0, 0, 2, 1, 0), match(1, 1, 2, 1, 0), match(2, 0, 1, 0, 0)];

		expect(positionsOf(3, matches)).toEqual([0, 0, 2]);
	});

	// Rain stops play. Teams that got an extra game must not be rewarded for it.
	it('ranks a partial night on points per match', () => {
		// A played once and won. B played twice, winning one and losing one.
		// B has more points, A has the better rate.
		const matches = [match(0, 0, 1, 1, 0), match(1, 1, 2, 3, 0)];
		const rows = getStandings(3, matches).sort((a, b) => a.position - b.position);

		expect(rows[0].team).toBe(0);
		expect(rows[0].points).toBe(3);
		expect(rows[1].team).toBe(1);
		expect(rows[1].points).toBe(3);
	});

	// The per-match ranking has to be invisible on an ordinary night: dividing
	// every team by the same number cannot reorder them.
	it('never puts a team with more points below one with fewer, when all played the same', () => {
		const matches = [match(0, 0, 1, 2, 0), match(1, 2, 3, 1, 0), match(2, 0, 2, 1, 0), match(3, 1, 3, 1, 0)];
		const rows = getStandings(4, matches);

		expect(rows.every(row => row.played === 2)).toBe(true);

		for (const above of rows) {
			for (const below of rows) {
				if (above.position < below.position) expect(above.points).toBeGreaterThanOrEqual(below.points);
			}
		}
	});

	it('ignores a match naming a team that no longer exists', () => {
		const rows = getStandings(2, [match(0, 0, 1, 1, 0), match(1, 2, 3, 5, 0)]);

		expect(rows).toHaveLength(2);
		expect(rows.reduce((total, row) => total + row.played, 0)).toBe(2);
	});

	it('leaves an unplayed night with everyone joint first, which scores nothing', () => {
		expect(positionsOf(4, [])).toEqual([0, 0, 0, 0]);
	});
});

describe('getPositions', () => {
	it('returns positions in team order, whatever order the table is in', () => {
		const matches = [match(0, 0, 1, 0, 3), match(1, 0, 2, 0, 1), match(2, 1, 2, 1, 0)];
		const positions = positionsOf(3, matches);

		// Team 1 won both, team 2 won one, team 0 lost both.
		expect(positions).toEqual([2, 0, 1]);
	});
});
