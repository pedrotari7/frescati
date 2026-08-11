import {
	describeSquads,
	getFixtures,
	getLapLength,
	getScheduleFit,
	getSideSize,
	getSquadSizes,
	getTeamCount,
	MAX_MATCHES,
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
	// A slot with no room at all still plays its one lap — `getFixtures` floors
	// at a full round robin regardless of fit — so this is the shape every test
	// below that isn't specifically about lapping relies on.
	const oneLap = (teamCount: number) => getFixtures(teamCount, 90, 0);

	it.each([
		[2, 1],
		[3, 6],
		[4, 6],
	])('%i teams play %i matches in one lap', (teamCount, expected) => {
		expect(oneLap(teamCount)).toHaveLength(expected);
	});

	it('has just the one fixture for two teams — nobody else to rotate through', () => {
		expect(oneLap(2)).toEqual([{ order: 0, teamA: 0, teamB: 1 }]);
	});

	it('has no fixtures below the floor', () => {
		expect(oneLap(0)).toEqual([]);
	});

	it('gives every team the same number of matches', () => {
		for (const teamCount of [2, 3, 4]) {
			const played = new Array(teamCount).fill(0);
			for (const fixture of oneLap(teamCount)) {
				played[fixture.teamA]++;
				played[fixture.teamB]++;
			}

			expect(new Set(played).size).toBe(1);
		}
	});

	it('has four teams meet each other exactly once a lap', () => {
		const pairs = oneLap(4).map(fixture => `${fixture.teamA}v${fixture.teamB}`);

		expect(new Set(pairs).size).toBe(6);
	});

	it('numbers the running order from zero', () => {
		expect(oneLap(4).map(fixture => fixture.order)).toEqual([0, 1, 2, 3, 4, 5]);
	});

	it('never asks four teams to play twice in a row more than the pitch forces', () => {
		const fixtures = oneLap(4);
		const backToBack = fixtures.filter((fixture, index) => {
			if (index === 0) return false;
			const previous = fixtures[index - 1];

			return [previous.teamA, previous.teamB].some(team => team === fixture.teamA || team === fixture.teamB);
		});

		expect(backToBack).toHaveLength(2);
	});

	// The motivating case: a ninety-minute slot at five minutes a match has
	// room for eighteen, not the six a single lap plays.
	it('laps the rotation to fill a slot with room for more than one', () => {
		expect(getFixtures(4, 5, 90)).toHaveLength(18);
	});

	it('repeats the same lap rather than a different rotation', () => {
		const lap = oneLap(4);

		for (const fixture of getFixtures(4, 5, 90)) {
			const source = lap[fixture.order % lap.length];
			expect([fixture.teamA, fixture.teamB]).toEqual([source.teamA, source.teamB]);
		}
	});

	// A lap of one fixture has nothing to repeat — replaying it is the same
	// match again, not another round — so two teams never lap, whatever the
	// slot and match length say.
	it('never laps two teams, however much room the slot has', () => {
		expect(getFixtures(2, 5, 90)).toHaveLength(1);
		expect(getFixtures(2, 1, 1_000)).toHaveLength(1);
	});

	it('never shrinks below one full lap, even into an overrun the slot cannot fit', () => {
		expect(getFixtures(4, 20, 30)).toHaveLength(6);
	});

	it('caps how many times the rotation is allowed to repeat', () => {
		expect(getFixtures(4, 1, 1_000)).toHaveLength(MAX_MATCHES);
	});

	// A cleared or zero match length can't size anything against the slot, so
	// this falls back to the one lap rather than dividing by zero.
	it('falls back to one lap when matchMinutes is not positive', () => {
		expect(getFixtures(4, 0, 90)).toHaveLength(6);
	});
});

describe('getLapLength', () => {
	it.each([
		[2, 1],
		[3, 6],
		[4, 6],
	])('one lap for %i teams is %i matches', (teamCount, expected) => {
		expect(getLapLength(teamCount)).toBe(expected);
	});

	it('has no lap below the floor', () => {
		expect(getLapLength(0)).toBe(0);
	});

	// The stride a screen groups a fixture list into rounds by — has to match
	// what `getFixtures` actually repeats, or a divider would land mid-lap.
	it('agrees with getFixtures about where one lap ends', () => {
		for (const teamCount of [2, 3, 4]) {
			expect(getLapLength(teamCount)).toBe(getFixtures(teamCount, 90, 0).length);
		}
	});
});

describe('getScheduleFit', () => {
	it('fills the slot with as many matches as fit, not just one lap', () => {
		expect(getScheduleFit(4, 12, 90)).toEqual({
			matchCount: 7,
			totalMinutes: 84,
			slotMinutes: 90,
			overrunMinutes: 0,
		});
	});

	it('lands exactly on a slot divisible into whole laps', () => {
		expect(getScheduleFit(4, 15, 90)).toEqual({
			matchCount: 6,
			totalMinutes: 90,
			slotMinutes: 90,
			overrunMinutes: 0,
		});
	});

	it('reports the overrun rather than refusing, when even one lap does not fit', () => {
		expect(getScheduleFit(4, 18, 90).overrunMinutes).toBe(18);
	});

	// The motivating case, pinned exactly: a ninety-minute slot at five
	// minutes a match used to play six matches and sit on sixty unused
	// minutes. It now plays eighteen.
	it('fills a ninety-minute slot at five minutes a match', () => {
		expect(getScheduleFit(4, 5, 90)).toEqual({
			matchCount: 18,
			totalMinutes: 90,
			slotMinutes: 90,
			overrunMinutes: 0,
		});
	});

	// Deliberate under-report, not a bug: two teams never lap, so `matchCount`
	// stays 1 and `totalMinutes` is one `matchMinutes` regardless of how much
	// of the ninety the two sides actually spend on the pitch.
	it('under-reports for two teams, since there is no lap to fill the slot with', () => {
		expect(getScheduleFit(2, 5, 90)).toEqual({
			matchCount: 1,
			totalMinutes: 5,
			slotMinutes: 90,
			overrunMinutes: 0,
		});
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

	it('has nothing to say about an empty game', () => {
		expect(describeSquads([])).toBeNull();
	});
});

describe('selectPlayedMatches', () => {
	// One lap, the same fallback `getFixtures` itself uses — everything in this
	// block except the two cases about lapping is about the filtering, not
	// about how many fixtures there are.
	const select = (teamCount: number, matches: ReturnType<typeof aMatch>[]) =>
		selectPlayedMatches(teamCount, 90, 0, matches);

	function aMatch(order: number, teamA: number, teamB: number, overrides: Record<string, unknown> = {}) {
		return {
			order,
			teamA,
			teamB,
			scoreA: 2,
			scoreB: 1,
			updatedBy: 'someone',
			updatedAt: '2026-09-01T19:30:00.000Z',
			...overrides,
		};
	}

	/** A full game, scored exactly as one lap of the rotation ran it. */
	const asPlayed = (teamCount: number) =>
		getFixtures(teamCount, 90, 0).map(fixture => aMatch(fixture.order, fixture.teamA, fixture.teamB));

	it('keeps every fixture a real game produces', () => {
		expect(select(4, asPlayed(4))).toHaveLength(6);
		expect(select(2, asPlayed(2))).toHaveLength(1);
	});

	// The reason this exists. Anybody holding a response on the game can write
	// to the scoreboard, and a match at an order nothing renders still moved
	// every rating on the game.
	it('drops a match at an order the game never reaches', () => {
		expect(select(2, [aMatch(0, 0, 1), aMatch(40, 0, 1)])).toEqual([aMatch(0, 0, 1)]);
	});

	it('drops a match between two teams that fixture never puts together', () => {
		// A four-team game opens 0v1, not 0v3.
		expect(select(4, [aMatch(0, 0, 3)])).toEqual([]);
	});

	// A reshuffle re-picks the rotation under any score already entered, so
	// almost nothing survives being rebuilt from four teams into three.
	it('drops what a lineup rebuilt underneath it stranded', () => {
		expect(select(3, asPlayed(4)).map(match => match.order)).toEqual([0]);
	});

	it('has nothing to keep for a headcount with no tournament in it', () => {
		expect(select(0, [aMatch(0, 0, 1)])).toEqual([]);
	});

	it('returns them in the order they were played', () => {
		expect(select(3, [aMatch(2, 2, 0), aMatch(0, 0, 1), aMatch(1, 1, 2)]).map(match => match.order)).toEqual([
			0, 1, 2,
		]);
	});

	// Only reachable for documents written before the id was bound to the order.
	it('keeps the later of two documents claiming one fixture', () => {
		const early = aMatch(0, 0, 1, { updatedAt: '2026-09-01T19:00:00.000Z', scoreA: 1 });
		const late = aMatch(0, 0, 1, { updatedAt: '2026-09-01T20:00:00.000Z', scoreA: 9 });

		expect(select(2, [late, early])).toEqual([late]);
		expect(select(2, [early, late])).toEqual([late]);
	});

	// `matchMinutes` and `slotMinutes` are part of legitimacy now that a
	// rotation can run more than one lap.
	it('keeps a match at an order only a longer slot reaches', () => {
		expect(selectPlayedMatches(4, 5, 90, [aMatch(6, 0, 1)])).toEqual([aMatch(6, 0, 1)]);
	});

	it('drops that same order when the slot does not stretch to it', () => {
		expect(selectPlayedMatches(4, 90, 0, [aMatch(6, 0, 1)])).toEqual([]);
	});

	// Two teams never lap, however large the slot — see `getFixtures` — so a
	// document at any order past zero is never legitimate for them.
	it('drops any order past zero for two teams, however long the slot', () => {
		expect(selectPlayedMatches(2, 1, 1_000, [aMatch(0, 0, 1), aMatch(1, 0, 1)])).toEqual([aMatch(0, 0, 1)]);
	});
});
