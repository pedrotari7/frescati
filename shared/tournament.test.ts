import {
	describeSquads,
	getFixtures,
	getScheduleFit,
	getSideSize,
	getSquadSizes,
	getTeamCount,
	MAX_TEAMS,
	selectPlayedMatches,
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

describe('selectPlayedMatches', () => {
	const aMatch = (order: number, teamA: number, teamB: number, overrides: Record<string, unknown> = {}) => ({
		order,
		teamA,
		teamB,
		scoreA: 2,
		scoreB: 1,
		updatedBy: 'someone',
		updatedAt: '2026-09-01T19:30:00.000Z',
		...overrides,
	});

	/** A full night, scored exactly as the rotation ran it. */
	const asPlayed = (teamCount: number) =>
		getFixtures(teamCount).map(fixture => aMatch(fixture.order, fixture.teamA, fixture.teamB));

	it('keeps every fixture a real night produces', () => {
		expect(selectPlayedMatches(4, asPlayed(4))).toHaveLength(6);
		expect(selectPlayedMatches(2, asPlayed(2))).toHaveLength(3);
	});

	// The reason this exists. Anybody holding a response on the game can write
	// to the scoreboard, and a match at an order nothing renders still moved
	// every rating on the night.
	it('drops a match at an order the night never reaches', () => {
		expect(selectPlayedMatches(2, [aMatch(0, 0, 1), aMatch(40, 0, 1)])).toEqual([aMatch(0, 0, 1)]);
	});

	it('drops a match between two teams that fixture never puts together', () => {
		// A four-team night opens 0v1, not 0v3.
		expect(selectPlayedMatches(4, [aMatch(0, 0, 3)])).toEqual([]);
	});

	// A reshuffle re-picks the rotation under any score already entered, so
	// almost nothing survives being rebuilt from four teams into three.
	it('drops what a lineup rebuilt underneath it stranded', () => {
		expect(selectPlayedMatches(3, asPlayed(4)).map(match => match.order)).toEqual([0]);
	});

	it('has nothing to keep for a headcount with no tournament in it', () => {
		expect(selectPlayedMatches(0, [aMatch(0, 0, 1)])).toEqual([]);
	});

	it('returns them in the order they were played', () => {
		expect(
			selectPlayedMatches(3, [aMatch(2, 2, 0), aMatch(0, 0, 1), aMatch(1, 1, 2)]).map(match => match.order)
		).toEqual([0, 1, 2]);
	});

	// Only reachable for documents written before the id was bound to the order.
	it('keeps the later of two documents claiming one fixture', () => {
		const early = aMatch(0, 0, 1, { updatedAt: '2026-09-01T19:00:00.000Z', scoreA: 1 });
		const late = aMatch(0, 0, 1, { updatedAt: '2026-09-01T20:00:00.000Z', scoreA: 9 });

		expect(selectPlayedMatches(2, [late, early])).toEqual([late]);
		expect(selectPlayedMatches(2, [early, late])).toEqual([late]);
	});
});
