import {
	availabilityGames,
	buildAvailability,
	describeAvailability,
	seasonExtras,
	tallyAvailability,
	type SeasonResponses,
} from './availability';
import type { Game, GameResponse, GameStatus, PlayerRole } from './types';

const game = (
	id: string,
	kickoff: string,
	status: GameStatus = 'scheduled'
): Pick<Game, 'id' | 'kickoff' | 'status'> => ({
	id,
	kickoff,
	status,
});

const response = (uid: string, status: 'in' | 'out', role: PlayerRole = 'member'): GameResponse => ({
	uid,
	status,
	role,
	respondedAt: '2026-08-30T09:00:00.000Z',
	updatedAt: '2026-08-30T09:00:00.000Z',
});

const GAMES = [
	game('g1', '2026-09-01T17:00:00.000Z'),
	game('g2', '2026-09-08T17:00:00.000Z'),
	game('g3', '2026-09-15T17:00:00.000Z'),
];

const RESPONSES: SeasonResponses = {
	g1: { anna: response('anna', 'in'), bo: response('bo', 'out') },
	g2: { anna: response('anna', 'out') },
};

describe('availabilityGames', () => {
	it('leaves out a game nobody played', () => {
		const games = [...GAMES, game('g4', '2026-09-22T17:00:00.000Z', 'cancelled')];

		expect(availabilityGames(games).map(entry => entry.id)).toEqual(['g1', 'g2', 'g3']);
	});

	it('keeps a played game, which is most of what a strip is', () => {
		expect(availabilityGames([game('g1', '2026-09-01T17:00:00.000Z', 'played')])).toHaveLength(1);
	});
});

describe('buildAvailability', () => {
	it('reads one player across the season in the order the games arrived', () => {
		expect(buildAvailability('anna', GAMES, RESPONSES)).toEqual([
			{ gameId: 'g1', kickoff: '2026-09-01T17:00:00.000Z', availability: 'in' },
			{ gameId: 'g2', kickoff: '2026-09-08T17:00:00.000Z', availability: 'out' },
			{ gameId: 'g3', kickoff: '2026-09-15T17:00:00.000Z', availability: 'unanswered' },
		]);
	});

	// The absence of a document is the answer, so a game somebody else answered
	// and one nobody has touched have to read the same for the player asked about.
	it('calls a missing response no answer whether or not anyone else replied', () => {
		expect(buildAvailability('cleo', GAMES, RESPONSES).map(mark => mark.availability)).toEqual([
			'unanswered',
			'unanswered',
			'unanswered',
		]);
	});

	it('gives every player the same number of marks, so the columns line up', () => {
		const games = [...GAMES, game('g4', '2026-09-22T17:00:00.000Z', 'cancelled')];

		expect(buildAvailability('anna', games, RESPONSES)).toHaveLength(3);
		expect(buildAvailability('bo', games, RESPONSES)).toHaveLength(3);
	});

	it('has nothing to draw for a season with no games yet', () => {
		expect(buildAvailability('anna', [], {})).toEqual([]);
	});
});

describe('seasonExtras', () => {
	const ANSWERS: SeasonResponses = {
		g1: { anna: response('anna', 'in'), kwame: response('kwame', 'in', 'extra') },
		g2: { kwame: response('kwame', 'out', 'extra'), maja: response('maja', 'in', 'extra') },
	};

	it('is everybody who answered and is not in the squad', () => {
		expect(seasonExtras(['anna', 'bo'], ANSWERS)).toEqual(['kwame', 'maja']);
	});

	it('names somebody once however many games they answered', () => {
		expect(seasonExtras(['anna'], ANSWERS).filter(uid => uid === 'kwame')).toHaveLength(1);
	});

	// An Out is an answer, and an extra who said it was asked to fill in and
	// turned it down. Leaving them out would make the list "who played" under a
	// heading that says who is around.
	it('counts an extra who only ever said no', () => {
		expect(seasonExtras(['anna'], { g1: { greta: response('greta', 'out', 'extra') } })).toEqual(['greta']);
	});

	// `role` is snapshotted at write time, so a season is full of answers whose
	// role disagrees with who is in the squad now. Membership is the tiebreak.
	it('reads the squad now rather than the role on the answer', () => {
		const answers: SeasonResponses = {
			g1: { anna: response('anna', 'in'), kwame: response('kwame', 'in', 'extra') },
		};

		expect(seasonExtras(['kwame'], answers)).toEqual(['anna']);
	});

	it('has nobody to list for a season nobody has answered', () => {
		expect(seasonExtras(['anna'], {})).toEqual([]);
	});
});

describe('tallyAvailability', () => {
	it('counts each of the three answers', () => {
		expect(tallyAvailability(buildAvailability('anna', GAMES, RESPONSES))).toEqual({
			in: 1,
			out: 1,
			unanswered: 1,
		});
	});

	it('counts nothing for an empty strip', () => {
		expect(tallyAvailability([])).toEqual({ in: 0, out: 0, unanswered: 0 });
	});
});

describe('describeAvailability', () => {
	it('says what the dots say', () => {
		expect(describeAvailability({ in: 18, out: 6, unanswered: 8 })).toBe(
			'In for 18 games, out for 6, no answer for 8'
		);
	});

	it('does not say "1 games"', () => {
		expect(describeAvailability({ in: 1, out: 0, unanswered: 0 })).toBe(
			'In for 1 game, out for 0, no answer for 0'
		);
	});
});
