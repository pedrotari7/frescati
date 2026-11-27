import { getFullTimeCard, pickFullTimeTakeover } from './fullTime';
import type { RatingLedgerEntry, TeamStanding, TournamentResult } from './types';

const DAY = 86_400_000;
const ME = 'me';

/** A rated game in season `s`. Elo before and after defaults to 1000 for everybody in it. */
const entry = ({
	gameId,
	day,
	positions,
	teams,
	elo = {},
}: {
	gameId: string;
	day: number;
	positions: Record<string, number>;
	teams?: Record<string, number>;
	elo?: Record<string, [number, number]>;
}): RatingLedgerEntry => {
	const kickoffMillis = day * DAY;
	const uids = Object.keys(positions);

	return {
		seasonId: 's',
		gameId,
		kickoff: new Date(kickoffMillis).toISOString(),
		kickoffMillis,
		finalisedAt: new Date(kickoffMillis + 3 * 3_600_000).toISOString(),
		positions,
		teams: teams ?? Object.fromEntries(uids.map(uid => [uid, positions[uid]])),
		before: Object.fromEntries(uids.map(uid => [uid, { elo: elo[uid]?.[0] ?? 1000, games: 1, updatedAt: '' }])),
		after: Object.fromEntries(uids.map(uid => [uid, { elo: elo[uid]?.[1] ?? 1000, games: 2, updatedAt: '' }])),
	} as RatingLedgerEntry;
};

/** Me on team 0 against a rival on team 1, my team finishing first or second. */
const played = (gameId: string, day: number, won: boolean, elo?: [number, number]) =>
	entry({
		gameId,
		day,
		positions: won ? { [ME]: 0, rival: 1 } : { [ME]: 1, rival: 0 },
		teams: { [ME]: 0, rival: 1 },
		elo: elo ? { [ME]: elo } : {},
	});

const standing = (team: number, position: number, won = 0, drawn = 0, lost = 0): TeamStanding => ({
	team,
	position,
	played: won + drawn + lost,
	won,
	drawn,
	lost,
	goalsFor: 0,
	goalsAgainst: 0,
	goalDifference: 0,
	points: 3 * won + drawn,
});

const resultFor = (standings: TeamStanding[], before = 1000, after = 1010): TournamentResult => ({
	standings,
	changes: [{ uid: ME, before, after, delta: after - before }],
	finalisedAt: '',
	finalisedBy: null,
});

const won = resultFor([standing(0, 0, 1), standing(1, 1, 0, 0, 1)]);
const lostStandings = [standing(0, 1, 0, 0, 1), standing(1, 0, 1)];
const lost = resultFor(lostStandings, 1000, 990);
/** A loss that still left me on 1100, higher than I have ever been. */
const lostHigh = resultFor(lostStandings, 1000, 1100);

/** The card for the last of `games`, which are both my career and the whole season. */
const cardFor = (games: RatingLedgerEntry[], result: TournamentResult) =>
	getFullTimeCard(games, games, result, games[games.length - 1].gameId, ME);

describe('getFullTimeCard', () => {
	it('has no card for somebody the result did not rate', () => {
		const games = [played('g1', 1, true)];

		expect(getFullTimeCard(games, games, { ...won, changes: [] }, 'g1', ME)).toBeNull();
	});

	it('has no card when the ledger entry has no team for them', () => {
		const games = [entry({ gameId: 'g1', day: 1, positions: { [ME]: 0 }, teams: {} })];

		expect(cardFor(games, won)).toBeNull();
	});

	it('reads the finish and the record off the result', () => {
		const three = resultFor([standing(0, 1, 1, 1, 1), standing(1, 0, 2, 1, 0), standing(2, 2, 0, 0, 3)]);
		const games = [
			entry({ gameId: 'g1', day: 1, positions: { [ME]: 1, b: 0, c: 2 }, teams: { [ME]: 0, b: 1, c: 2 } }),
		];

		expect(cardFor(games, three)).toMatchObject({
			seasonId: 's',
			gameId: 'g1',
			team: 0,
			position: 1,
			shared: false,
			teamCount: 3,
			record: { won: 1, drawn: 1, lost: 1 },
		});
	});

	it('says when first place was shared', () => {
		const level = resultFor([standing(0, 0, 0, 1), standing(1, 0, 0, 1)]);

		expect(cardFor([played('g1', 1, true)], level)?.shared).toBe(true);
	});

	it('takes the rating from the result', () => {
		expect(
			cardFor([played('g1', 1, true)], resultFor([standing(0, 0, 1), standing(1, 1)], 1040, 1052))
		).toMatchObject({ before: 1040, after: 1052, delta: 12 });
	});

	it('calls a second straight win the start of a run', () => {
		const games = [played('g1', 1, false), played('g2', 8, true), played('g3', 15, true)];

		expect(cardFor(games, won)?.highlights).toContainEqual({ kind: 'runStarted' });
	});

	it('counts a fourth straight win as a run extended', () => {
		const games = [1, 8, 15, 22].map((day, index) => played(`g${index}`, day, true));

		expect(cardFor(games, won)?.highlights).toContainEqual({ kind: 'runExtended', count: 4 });
	});

	it('marks a loss that ends a run of three', () => {
		const games = [played('g1', 1, true), played('g2', 8, true), played('g3', 15, true), played('g4', 22, false)];

		expect(cardFor(games, lost)?.highlights).toContainEqual({ kind: 'runEnded', count: 3 });
	});

	it('says nothing about a run of two ending', () => {
		const games = [played('g1', 1, true), played('g2', 8, true), played('g3', 15, false)];

		expect(cardFor(games, lost)?.highlights).toEqual([]);
	});

	describe('the season table', () => {
		/** `wins` single-player wins for `uid` before day 50. */
		const history = (uid: string, wins: number) =>
			Array.from({ length: wins }, (_, index) =>
				entry({ gameId: `${uid}-${index}`, day: 10 + index, positions: { [uid]: 0 } })
			);
		const tonight = entry({ gameId: 'tonight', day: 50, positions: { [ME]: 0 }, elo: { [ME]: [1000, 1020] } });
		const card = (season: RatingLedgerEntry[]) =>
			getFullTimeCard([...history(ME, 1), tonight], [...season, ...history(ME, 1), tonight], won, 'tonight', ME);

		it('notes a climb of two places', () => {
			const season = [...history('a', 3), ...history('b', 3), ...history('c', 2), ...history('d', 2)];

			expect(card(season)?.highlights).toContainEqual({ kind: 'tableMove', from: 4, to: 2 });
		});

		it('says nothing about a climb of one', () => {
			const season = [...history('a', 3), ...history('b', 3), ...history('c', 2)];

			expect(card(season)?.highlights.some(highlight => highlight.kind === 'tableMove')).toBe(false);
		});

		it('notes a climb of one into first', () => {
			expect(card(history('a', 2))?.highlights).toContainEqual({ kind: 'tableMove', from: 1, to: 0 });
		});
	});

	it('notes a career best once past the provisional games', () => {
		const earlier = [1, 2, 3, 4, 5].map((day, index) =>
			played(`g${index}`, day * 7, index % 2 === 0, [1000, 1000])
		);
		const games = [...earlier, played('best', 50, false, [1000, 1100])];

		expect(cardFor(games, lostHigh)?.highlights).toContainEqual({ kind: 'careerBest', rating: expect.any(Number) });
	});

	it('does not call a high in the first five games a career best', () => {
		const earlier = [1, 2, 3, 4].map((day, index) => played(`g${index}`, day * 7, false, [1000, 1000]));
		const games = [...earlier, played('best', 50, false, [1000, 1100])];

		expect(cardFor(games, lostHigh)?.highlights).toEqual([]);
	});

	it('celebrates a first win', () => {
		const games = [played('g1', 1, false), played('g2', 8, true)];
		// Far enough ahead that the win moves nobody on the table.
		const leader = [0, 1, 2].map(index => entry({ gameId: `r${index}`, day: index, positions: { rival: 0 } }));

		expect(getFullTimeCard(games, [...leader, ...games], won, 'g2', ME)?.highlights).toEqual([
			{ kind: 'firstWin' },
		]);
	});

	it('keeps two highlights, the run first', () => {
		const earlier = [1, 2, 3, 4, 5].map((day, index) => played(`g${index}`, day * 7, false, [1000, 1000]));
		const games = [...earlier, played('a', 50, true), played('b', 57, true, [1000, 1100])];

		expect(cardFor(games, won)?.highlights).toEqual([
			{ kind: 'runStarted' },
			{ kind: 'careerBest', rating: expect.any(Number) },
		]);
	});
});

describe('pickFullTimeTakeover', () => {
	const older = played('older', 10, true);
	const latest = played('latest', 20, false);
	const finalised = new Date(latest.finalisedAt).getTime();

	it('picks the latest confirmed game they played', () => {
		expect(pickFullTimeTakeover([latest, older], ME, new Date(finalised + DAY), null)).toBe(latest);
	});

	it('lets a card go after seven days', () => {
		expect(pickFullTimeTakeover([latest], ME, new Date(finalised + 7 * DAY + 60_000), null)).toBeNull();
	});

	it('shows nothing when they missed the latest game', () => {
		const without = entry({ gameId: 'latest', day: 20, positions: { someone: 0 } });

		expect(pickFullTimeTakeover([without, older], ME, new Date(finalised + DAY), null)).toBeNull();
	});

	it('shows nothing once that card has been seen', () => {
		expect(pickFullTimeTakeover([latest], ME, new Date(finalised + DAY), latest.finalisedAt)).toBeNull();
	});

	it('shows it again when a replay confirmed it after it was seen', () => {
		const seenAt = new Date(finalised - 60_000).toISOString();

		expect(pickFullTimeTakeover([latest], ME, new Date(finalised + DAY), seenAt)).toBe(latest);
	});

	it('breaks a tie on confirmation time by game id', () => {
		const twin = { ...played('latest-b', 20, true), finalisedAt: latest.finalisedAt };

		expect(pickFullTimeTakeover([latest, twin], ME, new Date(finalised + DAY), null)).toBe(twin);
	});
});
