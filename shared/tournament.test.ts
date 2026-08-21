import {
	describeSquads,
	getFixtures,
	getRoundLength,
	getScheduleFit,
	getSideSize,
	getScoreAccess,
	getSquadSizes,
	getTeamCount,
	MAX_MATCHES,
	MAX_SIDE,
	MAX_TEAMS,
	selectPlayedMatches,
} from './tournament';

describe('getTeamCount', () => {
	it.each([
		[6, 0],
		[7, 0],
		[8, 2],
		[11, 2],
		[12, 2],
		[13, 3],
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
		[12, 2, [6, 6]],
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

	// Twelve players are two squads of six, and the point of the cap is that
	// this is 5v5 with a sub each rather than 6v6.
	it('never puts more on than the pitch holds', () => {
		expect(getSideSize(6, 6)).toBe(MAX_SIDE);
		expect(getSideSize(8, 7)).toBe(MAX_SIDE);
	});

	it('keeps every fixture inside the pitch, whatever the turnout', () => {
		for (let playing = 8; playing <= 40; playing++) {
			const teamCount = getTeamCount(playing);
			const sizes = getSquadSizes(playing, teamCount);

			for (const fixture of getFixtures(teamCount, 15, 90)) {
				expect(getSideSize(sizes[fixture.teamA], sizes[fixture.teamB])).toBeLessThanOrEqual(MAX_SIDE);
			}
		}
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

	it('lays the four-team lap out in the balanced order', () => {
		expect(oneLap(4)).toEqual([
			{ order: 0, teamA: 0, teamB: 1 },
			{ order: 1, teamA: 2, teamB: 3 },
			{ order: 2, teamA: 0, teamB: 2 },
			{ order: 3, teamA: 1, teamB: 3 },
			{ order: 4, teamA: 0, teamB: 3 },
			{ order: 5, teamA: 1, teamB: 2 },
		]);
	});

	// Keeping a team on for every single changeover was tried and measured:
	// it forces some other team to sit out three matches straight, which is
	// worse than the changeover it avoids — see the doc comment above
	// `ROTATIONS`. So four teams take the changeover on the chin most of the
	// time; only two of the five keep somebody on.
	it('keeps a team on for exactly two of the four-team changeovers', () => {
		const fixtures = oneLap(4);
		const backToBack = fixtures.filter((fixture, index) => {
			if (index === 0) return false;
			const previous = fixtures[index - 1];

			return [previous.teamA, previous.teamB].some(team => team === fixture.teamA || team === fixture.teamB);
		});

		expect(backToBack).toHaveLength(2);
	});

	// The actual point of that trade: nobody, on the pitch or off it, ever
	// goes three matches without a change. Three teams get this for free;
	// four because the order is chosen for it. Checked across several laps so
	// a lap folding into the next can't quietly create what one lap avoids.
	it('never asks a team to play, or wait, three matches running', () => {
		for (const teamCount of [3, 4]) {
			const fixtures = getFixtures(teamCount, 5, 300);

			for (let team = 0; team < teamCount; team++) {
				let playRun = 0;
				let waitRun = 0;
				let longestPlayRun = 0;
				let longestWaitRun = 0;

				for (const fixture of fixtures) {
					const playing = fixture.teamA === team || fixture.teamB === team;
					playRun = playing ? playRun + 1 : 0;
					waitRun = playing ? 0 : waitRun + 1;
					longestPlayRun = Math.max(longestPlayRun, playRun);
					longestWaitRun = Math.max(longestWaitRun, waitRun);
				}

				expect(longestPlayRun).toBeLessThanOrEqual(2);
				expect(longestWaitRun).toBeLessThanOrEqual(2);
			}
		}
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

describe('getRoundLength', () => {
	it.each([
		[2, 1],
		[3, 3],
		[4, 6],
	])('one round for %i teams is %i matches', (teamCount, expected) => {
		expect(getRoundLength(teamCount)).toBe(expected);
	});

	it('has no round below the floor', () => {
		expect(getRoundLength(0)).toBe(0);
	});

	// The three-team lap is a double round robin, so a round is half of it. This
	// is the case that read as one six-match "Round 1" when the divider used the
	// lap length instead.
	it('is half a lap for three teams, and the whole of it for four', () => {
		expect(getRoundLength(3)).toBe(getFixtures(3, 90, 0).length / 2);
		expect(getRoundLength(4)).toBe(getFixtures(4, 90, 0).length);
	});

	// The stride a screen groups a fixture list into rounds by, so what it
	// promises is that each block of that many really is a round: every pair
	// once, nobody twice, nobody left out. Checked across several laps, since a
	// divider lands wherever the fixture list has got to and not only inside the
	// first one.
	it('has every block of that many fixtures play a complete round robin', () => {
		for (const teamCount of [3, 4]) {
			const roundLength = getRoundLength(teamCount);
			const fixtures = getFixtures(teamCount, 10, 300);

			expect(fixtures.length).toBeGreaterThan(roundLength * 2);

			for (let start = 0; start + roundLength <= fixtures.length; start += roundLength) {
				const pairs = fixtures
					.slice(start, start + roundLength)
					.map(fixture => `${Math.min(fixture.teamA, fixture.teamB)}v${Math.max(fixture.teamA, fixture.teamB)}`);

				expect(new Set(pairs).size).toBe(roundLength);
			}
		}
	});
});

describe('getScheduleFit', () => {
	it('fills the slot with as many matches as fit, not just one lap', () => {
		expect(getScheduleFit(4, 12, 90)).toEqual({
			matchCount: 7,
			matchMinutes: 12,
			totalMinutes: 84,
			slotMinutes: 90,
			overrunMinutes: 0,
		});
	});

	it('lands exactly on a slot divisible into whole laps', () => {
		expect(getScheduleFit(4, 15, 90)).toEqual({
			matchCount: 6,
			matchMinutes: 15,
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
			matchMinutes: 5,
			totalMinutes: 90,
			slotMinutes: 90,
			overrunMinutes: 0,
		});
	});

	// Two teams never lap, so the one fixture they get is the evening: five
	// minutes of it and eighty-five of nothing is not what happens, and the
	// badge saying so read as a bug.
	it('gives a lone fixture the whole slot', () => {
		expect(getScheduleFit(2, 5, 90)).toEqual({
			matchCount: 1,
			matchMinutes: 90,
			totalMinutes: 90,
			slotMinutes: 90,
			overrunMinutes: 0,
		});
	});

	// The match length can't overrun a slot it was taken from, however short
	// the admin set the rotation.
	it('never reports an overrun for a lone fixture', () => {
		expect(getScheduleFit(2, 120, 90)).toMatchObject({ matchMinutes: 90, overrunMinutes: 0 });
	});
});

describe('describeSquads', () => {
	it.each([
		[[5, 5], '5v5'],
		[[6, 5], '5v5'],
		[[6, 6], '5v5'],
		[[4, 4, 4], '3 teams · 4 a side'],
		[[5, 5, 4], '3 teams · 4–5 a side'],
		[[5, 5, 5, 5], '4 teams · 5 a side'],
		[[8, 7, 7, 7], '4 teams · 5 a side'],
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

describe('getScoreAccess', () => {
	const access = (overrides: Partial<Parameters<typeof getScoreAccess>[0]> = {}) =>
		getScoreAccess({ finalised: false, isAdmin: false, hasResponded: false, ...overrides });

	// The point of the scoreboard: whoever has a free hand enters the score.
	it('opens an unconfirmed game to anybody who answered it', () => {
		expect(access({ hasResponded: true })).toBe('open');
	});

	it('opens an unconfirmed game to an admin who never answered it', () => {
		expect(access({ isAdmin: true })).toBe('open');
	});

	it('keeps somebody who never answered off an unconfirmed scoreboard', () => {
		expect(access()).toBe('none');
	});

	// The whole reason for the third state: the ratings are applied, so a stepper
	// that stayed live is a brush of a thumb away from replaying the ladder.
	it('locks a confirmed game to the admin who may still correct it', () => {
		expect(access({ finalised: true, isAdmin: true })).toBe('locked');
	});

	it('locks it whether or not that admin played in it', () => {
		expect(access({ finalised: true, isAdmin: true, hasResponded: true })).toBe('locked');
	});

	it('closes a confirmed game to everybody else, including the people who played', () => {
		expect(access({ finalised: true, hasResponded: true })).toBe('none');
	});
});
