import {
	describeSquads,
	getFixtures,
	getScheduleFit,
	getSideSize,
	getSquadSizes,
	getTeamCount,
	MAX_TEAMS,
} from './tournament';

describe('getTeamCount', () => {
	it.each([
		[6, 0],
		[7, 0],
		[8, 2],
		[11, 2],
		[12, 3],
		[15, 3],
		[16, 4],
		[24, 4],
		[40, 4],
	])('%i players makes %i teams', (playing, expected) => {
		expect(getTeamCount(playing)).toBe(expected);
	});

	it('never exceeds the cap, however many turn up', () => {
		expect(getTeamCount(200)).toBe(MAX_TEAMS);
	});
});

describe('getSquadSizes', () => {
	it.each([
		[8, 2, [4, 4]],
		[9, 2, [5, 4]],
		[11, 2, [6, 5]],
		[12, 3, [4, 4, 4]],
		[13, 3, [5, 4, 4]],
		[14, 3, [5, 5, 4]],
		[16, 4, [4, 4, 4, 4]],
		[18, 4, [5, 5, 4, 4]],
		[20, 4, [5, 5, 5, 5]],
	])('%i players across %i teams is %j', (playing, teamCount, expected) => {
		expect(getSquadSizes(playing, teamCount)).toEqual(expected);
	});

	it('always seats everyone', () => {
		for (let playing = 8; playing <= 40; playing++) {
			const sizes = getSquadSizes(playing, getTeamCount(playing));
			expect(sizes.reduce((total, size) => total + size, 0)).toBe(playing);
		}
	});

	it('never differs by more than one, so nobody is stranded outside a squad', () => {
		for (let playing = 8; playing <= 40; playing++) {
			const sizes = getSquadSizes(playing, getTeamCount(playing));
			expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
		}
	});
});

describe('getSideSize', () => {
	it('plays the smaller squad, so the sides are even', () => {
		expect(getSideSize(6, 5)).toBe(5);
		expect(getSideSize(4, 4)).toBe(4);
	});
});

describe('getFixtures', () => {
	it.each([
		[2, 3],
		[3, 6],
		[4, 6],
	])('%i teams play %i matches', (teamCount, expected) => {
		expect(getFixtures(teamCount)).toHaveLength(expected);
	});

	it('has no fixtures below the floor', () => {
		expect(getFixtures(0)).toEqual([]);
	});

	it('gives every team the same number of matches', () => {
		for (const teamCount of [2, 3, 4]) {
			const played = new Array(teamCount).fill(0);
			for (const fixture of getFixtures(teamCount)) {
				played[fixture.teamA]++;
				played[fixture.teamB]++;
			}

			expect(new Set(played).size).toBe(1);
		}
	});

	it('has four teams meet each other exactly once', () => {
		const pairs = getFixtures(4).map(fixture => `${fixture.teamA}v${fixture.teamB}`);

		expect(new Set(pairs).size).toBe(6);
	});

	it('numbers the running order from zero', () => {
		expect(getFixtures(4).map(fixture => fixture.order)).toEqual([0, 1, 2, 3, 4, 5]);
	});

	it('never asks four teams to play twice in a row more than the pitch forces', () => {
		const fixtures = getFixtures(4);
		const backToBack = fixtures.filter((fixture, index) => {
			if (index === 0) return false;
			const previous = fixtures[index - 1];

			return [previous.teamA, previous.teamB].some(team => team === fixture.teamA || team === fixture.teamB);
		});

		expect(backToBack).toHaveLength(2);
	});
});

describe('getScheduleFit', () => {
	it('fits six twelve-minute matches into a ninety-minute slot', () => {
		expect(getScheduleFit(4, 12, 90)).toEqual({
			matchCount: 6,
			totalMinutes: 72,
			slotMinutes: 90,
			overrunMinutes: 0,
		});
	});

	it('reports the overrun rather than refusing', () => {
		expect(getScheduleFit(4, 18, 90).overrunMinutes).toBe(18);
	});
});

describe('describeSquads', () => {
	it.each([
		[[5, 5], '5v5'],
		[[6, 5], '5v5'],
		[[4, 4, 4], '3 teams · 4 a side'],
		[[5, 5, 4], '3 teams · 4–5 a side'],
		[[5, 5, 5, 5], '4 teams · 5 a side'],
	])('%j reads as %s', (sizes, expected) => {
		expect(describeSquads(sizes)).toBe(expected);
	});

	it('has nothing to say about an empty night', () => {
		expect(describeSquads([])).toBeNull();
	});
});
