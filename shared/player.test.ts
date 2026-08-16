import { getPlayerChemistry, getPlayerGames, getPlayerLinks, getPlayerRecord, getRatingTrend } from './player';
import type { PlayerLink } from './player';
import { PROVISIONAL_GAMES } from './rating';
import type { PlayerRating, RatingLedgerEntry } from './types';

const rating = (elo: number, games = PROVISIONAL_GAMES): PlayerRating => ({
	elo,
	games,
	updatedAt: '2026-09-01T19:00:00.000Z',
});

/** `week` is weeks after the first seeded kickoff, so ordering is readable. */
const entry = (
	gameId: string,
	week: number,
	positions: Record<string, number>,
	before: Record<string, number | null>,
	after: Record<string, number>,
	seasonId = 's1',
	seedElo?: number
): RatingLedgerEntry => {
	const kickoff = new Date(Date.parse('2026-09-01T17:00:00.000Z') + week * 604_800_000).toISOString();

	return {
		seasonId,
		gameId,
		kickoff,
		kickoffMillis: Date.parse(kickoff),
		finalisedAt: kickoff,
		positions,
		before: Object.fromEntries(
			Object.entries(before).map(([uid, elo]) => [uid, elo === null ? null : rating(elo)])
		),
		after: Object.fromEntries(Object.entries(after).map(([uid, elo]) => [uid, rating(elo)])),
		...(seedElo === undefined ? {} : { seedElo }),
	};
};

describe('getPlayerGames', () => {
	it('reads what each game did to the player', () => {
		const games = getPlayerGames([entry('g1', 0, { a: 1, b: 0 }, { a: 1000, b: 1000 }, { a: 980, b: 1020 })], 'a');

		expect(games).toEqual([
			{
				seasonId: 's1',
				gameId: 'g1',
				kickoff: '2026-09-01T17:00:00.000Z',
				kickoffMillis: Date.parse('2026-09-01T17:00:00.000Z'),
				position: 1,
				won: false,
				motm: false,
				before: 1000,
				after: 980,
				delta: -20,
			},
		]);
	});

	it('leaves out games the player did not appear in', () => {
		const games = getPlayerGames(
			[entry('g1', 0, { a: 0 }, { a: 1000 }, { a: 1020 }), entry('g2', 1, { b: 0 }, { b: 1000 }, { b: 1020 })],
			'a'
		);

		expect(games.map(game => game.gameId)).toEqual(['g1']);
	});

	it('runs oldest first however the query returned them', () => {
		const games = getPlayerGames(
			[
				entry('g3', 2, { a: 0 }, { a: 1010 }, { a: 1030 }),
				entry('g1', 0, { a: 0 }, { a: 1000 }, { a: 1020 }),
				entry('g2', 1, { a: 1 }, { a: 1020 }, { a: 1010 }),
			],
			'a'
		);

		expect(games.map(game => game.gameId)).toEqual(['g1', 'g2', 'g3']);
	});

	// Two games in different seasons can share a slot, and a career that reorders
	// itself between devices is a career nobody can quote.
	it('breaks a kickoff tie on the game id', () => {
		const games = getPlayerGames(
			[
				entry('sunday', 0, { a: 0 }, { a: 1000 }, { a: 1020 }, 's2'),
				entry('frescati', 0, { a: 1 }, { a: 1000 }, { a: 980 }),
			],
			'a'
		);

		expect(games.map(game => game.gameId)).toEqual(['frescati', 'sunday']);
	});

	// The seed is the rating the game rated them off, so it is what they carried
	// in — and the movement matches the one the team sheet showed on the night.
	it('reads a player who arrived unrated from the seed the game used', () => {
		const games = getPlayerGames([entry('g1', 0, { a: 0 }, { a: null }, { a: 1030 }, 's1', 1010)], 'a');

		expect(games[0]).toMatchObject({ before: 1010, after: 1030, delta: 20 });
	});

	// Nothing to measure from, so the game reads as no movement rather than as a
	// gain out of a seed nobody wrote down.
	it('counts no movement for an unrated arrival on an entry written before the seed was stored', () => {
		const games = getPlayerGames([entry('g1', 0, { a: 0 }, { a: null }, { a: 1030 })], 'a');

		expect(games[0]).toMatchObject({ before: null, after: 1030, delta: 0 });
	});

	it('shares a win with everyone on a joint-first team', () => {
		const games = getPlayerGames([entry('g1', 0, { a: 0, b: 0, c: 2 }, { a: 1000 }, { a: 1000 })], 'a');

		expect(games[0].won).toBe(true);
	});

	it('skips a ledger entry written before positions existed', () => {
		const legacy = entry('g1', 0, {}, { a: 1000 }, { a: 1010 });
		delete (legacy as Partial<RatingLedgerEntry>).positions;

		expect(getPlayerGames([legacy], 'a')).toEqual([]);
	});

	it('has nothing to show for somebody who has never played', () => {
		expect(getPlayerGames([], 'a')).toEqual([]);
	});
});

describe('getPlayerRecord', () => {
	const season = [
		entry('g1', 0, { a: 0 }, { a: 1000 }, { a: 1020 }),
		entry('g2', 1, { a: 0 }, { a: 1020 }, { a: 1040 }),
		entry('g3', 2, { a: 2 }, { a: 1040 }, { a: 1010 }),
		entry('g4', 3, { a: 0 }, { a: 1010 }, { a: 1030 }),
	];

	it('counts appearances and wins', () => {
		expect(getPlayerRecord(season, 'a')).toMatchObject({ appearances: 4, wins: 3 });
	});

	it('finds the longest run of wins', () => {
		expect(getPlayerRecord(season, 'a').bestRun).toBe(2);
	});

	it('counts the run they are on right now', () => {
		expect(getPlayerRecord(season, 'a').currentRun).toBe(1);
	});

	it('is on no run at all after a game they did not win', () => {
		expect(getPlayerRecord(season.slice(0, 3), 'a').currentRun).toBe(0);
	});

	// The peak is a high-water mark, so a rating that has since come back down
	// must not quietly follow it.
	it('remembers the highest rating ever carried out of a game', () => {
		expect(getPlayerRecord(season, 'a').peak).toBe(1040);
	});

	it('has no peak for somebody who has never played', () => {
		expect(getPlayerRecord([], 'a')).toMatchObject({ appearances: 0, wins: 0, bestRun: 0, peak: null });
	});
});

describe('getRatingTrend', () => {
	it('opens on the rating they took into their first game', () => {
		const games = getPlayerGames(
			[entry('g1', 0, { a: 0 }, { a: 1000 }, { a: 1020 }), entry('g2', 1, { a: 1 }, { a: 1020 }, { a: 1005 })],
			'a'
		);

		expect(getRatingTrend(games)).toEqual([1000, 1020, 1005]);
	});

	// They took the seed into that game, so the line starts there and the first
	// result reads as a movement like every one after it.
	it('opens on the seed for somebody who arrived unrated', () => {
		const games = getPlayerGames(
			[
				entry('g1', 0, { a: 0 }, { a: null }, { a: 1030 }, 's1', 1010),
				entry('g2', 1, { a: 1 }, { a: 1030 }, { a: 1015 }),
			],
			'a'
		);

		expect(getRatingTrend(games)).toEqual([1010, 1030, 1015]);
	});

	// No seed was recorded, so a line drawn from one would show a movement
	// nothing can vouch for.
	it('starts at the first result on an entry written before the seed was stored', () => {
		const games = getPlayerGames(
			[entry('g1', 0, { a: 0 }, { a: null }, { a: 1030 }), entry('g2', 1, { a: 1 }, { a: 1030 }, { a: 1015 })],
			'a'
		);

		expect(getRatingTrend(games)).toEqual([1030, 1015]);
	});

	it('has nothing to draw for somebody who has never played', () => {
		expect(getRatingTrend([])).toEqual([]);
	});
});

/**
 * A lineup and how it finished, which is all a link reads — the ratings on the
 * entry are irrelevant here. `teams` puts each player on a team; `places` says
 * where each of those teams came, 0-indexed and shared on a tie exactly as
 * `getStandings` hands them over.
 */
const played = (gameId: string, teams: Record<string, number>, places: number[]): RatingLedgerEntry => ({
	...entry(gameId, 0, Object.fromEntries(Object.entries(teams).map(([uid, team]) => [uid, places[team]])), {}, {}),
	teams,
});

describe('getPlayerLinks', () => {
	it('counts a game on the same team as one played together', () => {
		expect(getPlayerLinks([played('g1', { a: 0, b: 0, c: 1 }, [0, 1])], 'a')).toEqual([
			{ uid: 'b', shared: 1, together: 1, wonTogether: 1, against: 0, beat: 0, drewWith: 0, lostTo: 0 },
			{ uid: 'c', shared: 1, together: 0, wonTogether: 0, against: 1, beat: 1, drewWith: 0, lostTo: 0 },
		]);
	});

	it('counts the other way round when the other team wins', () => {
		expect(getPlayerLinks([played('g1', { a: 0, b: 1 }, [1, 0])], 'a')).toEqual([
			{ uid: 'b', shared: 1, together: 0, wonTogether: 0, against: 1, beat: 0, drewWith: 0, lostTo: 1 },
		]);
	});

	// The case the whole team map exists for. Both players are on position 0, so
	// reading places alone makes a drawn game look like a partnership — and in a
	// two-team draw it makes the entire lineup look like one team.
	it('reads a two-team draw as a draw, not as a partnership', () => {
		expect(getPlayerLinks([played('g1', { a: 0, b: 1 }, [0, 0])], 'a')).toEqual([
			{ uid: 'b', shared: 1, together: 0, wonTogether: 0, against: 1, beat: 0, drewWith: 1, lostTo: 0 },
		]);
	});

	// Two teams tie for first and the third is left behind: the tie is a draw
	// between those two and a win over the one below them, all in one game.
	it('separates a shared first from the team underneath it', () => {
		const links = getPlayerLinks([played('g1', { a: 0, b: 1, c: 2 }, [0, 0, 2])], 'a');

		expect(links).toEqual([
			{ uid: 'b', shared: 1, together: 0, wonTogether: 0, against: 1, beat: 0, drewWith: 1, lostTo: 0 },
			{ uid: 'c', shared: 1, together: 0, wonTogether: 0, against: 1, beat: 1, drewWith: 0, lostTo: 0 },
		]);
	});

	// A shared first is still a win by the app's own definition, the same way the
	// record above counts it — it just isn't a win over the team you shared it
	// with.
	it('still counts a shared first as a win for the pair who shared it', () => {
		const links = getPlayerLinks([played('g1', { a: 0, b: 0, c: 1 }, [0, 0])], 'a');

		expect(links.find(link => link.uid === 'b')).toMatchObject({ together: 1, wonTogether: 1 });
		// And a draw against the team they shared it with, in the same breath.
		expect(links.find(link => link.uid === 'c')).toMatchObject({ against: 1, drewWith: 1 });
	});

	it('adds a pair up across every game they shared', () => {
		const links = getPlayerLinks(
			[
				played('g1', { a: 0, b: 0 }, [0]),
				played('g2', { a: 0, b: 1 }, [0, 1]),
				played('g3', { a: 0, b: 0 }, [1, 0]),
			],
			'a'
		);

		expect(links).toEqual([
			{ uid: 'b', shared: 3, together: 2, wonTogether: 1, against: 1, beat: 1, drewWith: 0, lostTo: 0 },
		]);
	});

	// What every entry written before the map existed looks like. There is no
	// honest way to read one: the thing missing is the only thing that separates
	// a teammate from an opponent.
	it('skips a game whose entry has no team map', () => {
		expect(getPlayerLinks([entry('g1', 0, { a: 0, b: 1 }, {}, {})], 'a')).toEqual([]);
	});

	it('leaves out games the player did not play in', () => {
		expect(getPlayerLinks([played('g1', { b: 0, c: 1 }, [0, 1])], 'a')).toEqual([]);
	});

	it('never links a player to themselves', () => {
		expect(getPlayerLinks([played('g1', { a: 0, b: 1 }, [0, 1])], 'a').map(link => link.uid)).toEqual(['b']);
	});

	// Deterministic on both keys, so the list draws the same way on every device
	// rather than however the query happened to return.
	it('orders by games shared, then by uid', () => {
		const links = getPlayerLinks(
			[played('g1', { a: 0, b: 1, c: 1 }, [0, 1]), played('g2', { a: 0, c: 1 }, [0, 1])],
			'a'
		);

		expect(links.map(link => [link.uid, link.shared])).toEqual([
			['c', 2],
			['b', 1],
		]);
	});
});

describe('getPlayerChemistry', () => {
	const links = (...rows: Partial<PlayerLink>[]): PlayerLink[] =>
		rows.map((row, index) => ({
			uid: `p${index}`,
			shared: 0,
			together: 0,
			wonTogether: 0,
			against: 0,
			beat: 0,
			drewWith: 0,
			lostTo: 0,
			...row,
		}));

	// By rate, so somebody who turns up every week can't take it on volume.
	it('picks the partnership that wins most often', () => {
		const chemistry = getPlayerChemistry(
			links({ together: 10, wonTogether: 5 }, { together: 4, wonTogether: 3 }),
			4
		);

		expect(chemistry.bestWith?.uid).toBe('p1');
	});

	// One game together is a hundred per cent partnership, and a screen that
	// crowns a new best friend every week is one nobody believes twice.
	it('ignores a partnership too short to mean anything', () => {
		const chemistry = getPlayerChemistry(
			links({ together: 1, wonTogether: 1 }, { together: 6, wonTogether: 3 }),
			4
		);

		expect(chemistry.bestWith?.uid).toBe('p1');
	});

	it('has no best partner when nobody clears the bar', () => {
		expect(getPlayerChemistry(links({ together: 2, wonTogether: 2 }), 4).bestWith).toBeNull();
	});

	// Two partnerships on the same rate is the ordinary case in a group of a
	// dozen, and whichever the sort happened to leave first would otherwise
	// differ between two people looking at the same profile.
	it('breaks a tied rate on the bigger sample, then the uid', () => {
		const tied = links(
			{ uid: 'zoe', together: 4, wonTogether: 2 },
			{ uid: 'anders', together: 8, wonTogether: 4 },
			{ uid: 'björn', together: 8, wonTogether: 4 }
		);

		expect(getPlayerChemistry(tied, 4).bestWith?.uid).toBe('anders');
	});

	it('breaks a tied head-to-head the same way', () => {
		const tied = links(
			{ uid: 'zoe', against: 5, beat: 1, lostTo: 3 },
			{ uid: 'anders', against: 9, beat: 3, lostTo: 5 }
		);

		expect(getPlayerChemistry(tied, 4).nemesis?.uid).toBe('anders');
	});

	it('names the opponent with the best of it', () => {
		const chemistry = getPlayerChemistry(
			links({ against: 8, beat: 1, lostTo: 7 }, { against: 8, beat: 3, lostTo: 5 }),
			4
		);

		expect(chemistry.nemesis?.uid).toBe('p0');
	});

	// Somebody this player is level with, or ahead of, is not a nemesis — and
	// "worst" against a group they beat every week would be an invented enemy.
	it('has no nemesis among opponents it is level with or beating', () => {
		expect(
			getPlayerChemistry(links({ against: 8, beat: 4, lostTo: 4 }, { against: 6, beat: 5, lostTo: 1 }), 4)
		).toMatchObject({ nemesis: null });
	});

	// A run of draws is not a beating. Level finishes belong to neither side, so
	// they move the head-to-head not at all.
	it('does not read a pile of draws as a losing record', () => {
		expect(getPlayerChemistry(links({ against: 9, beat: 1, drewWith: 7, lostTo: 1 }), 4).nemesis).toBeNull();
	});
});
