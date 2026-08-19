import {
	canReportAbsence,
	findCountsDrift,
	findLiveGame,
	getAbsentUids,
	getAvailabilityChange,
	getFormat,
	getGameLifecycle,
	getHeadcountState,
	getMinPlayers,
	getNoResponseCount,
	getResponseDeadline,
	getRole,
	getSilentMembers,
	groupGames,
	isAbsent,
	isConfirmed,
	isWatchable,
	parseCount,
	parseReminderHours,
	sortResponses,
	tallyResponses,
} from './game';
import type { Game, GameResponse, Season } from './types';
import { EMPTY_COUNTS } from './types';

const season = {
	minPlayers: 10,
	responseDeadlineHours: 24,
	memberUids: ['member-a', 'member-b'],
} as Season;

const game = {
	kickoff: '2026-09-01T17:00:00.000Z',
	endsAt: '2026-09-01T18:30:00.000Z',
	status: 'scheduled',
	counts: { ...EMPTY_COUNTS },
} as Game;

const response = (overrides: Partial<GameResponse>): GameResponse => ({
	uid: 'someone',
	status: 'in',
	role: 'extra',
	respondedAt: '2026-08-30T10:00:00.000Z',
	updatedAt: '2026-08-30T10:00:00.000Z',
	...overrides,
});

describe('getResponseDeadline', () => {
	it('subtracts the season deadline from kickoff', () => {
		expect(getResponseDeadline(game, season)).toBe('2026-08-31T17:00:00.000Z');
	});
});

describe('getGameLifecycle', () => {
	it.each([
		['2026-08-25T12:00:00Z', 'open'],
		['2026-08-31T18:00:00Z', 'locked'],
		['2026-09-01T17:30:00Z', 'live'],
		['2026-09-01T19:00:00Z', 'finished'],
	])('at %s the game is %s', (now, expected) => {
		expect(getGameLifecycle(game, season, new Date(now))).toBe(expected);
	});

	it('reports cancelled ahead of everything else', () => {
		expect(getGameLifecycle({ ...game, status: 'cancelled' }, season, new Date('2026-08-25T12:00:00Z'))).toBe(
			'cancelled'
		);
	});

	it('flips to live exactly at kickoff', () => {
		expect(getGameLifecycle(game, season, new Date(game.kickoff))).toBe('live');
	});

	it('flips to finished exactly at the final whistle', () => {
		expect(getGameLifecycle(game, season, new Date(game.endsAt))).toBe('finished');
	});
});

describe('getMinPlayers', () => {
	it('falls back to the season minimum', () => {
		expect(getMinPlayers(game, season)).toBe(10);
	});

	it('prefers a per-game override', () => {
		expect(getMinPlayers({ ...game, minPlayers: 14 }, season)).toBe(14);
	});

	it('honours an override of zero', () => {
		expect(getMinPlayers({ ...game, minPlayers: 0 }, season)).toBe(0);
	});
});

describe('getHeadcountState', () => {
	it('is at risk below the minimum', () => {
		expect(getHeadcountState({ ...game, counts: { ...EMPTY_COUNTS, playing: 9 } }, season)).toBe('at-risk');
	});

	it('is ready once the minimum is met', () => {
		expect(getHeadcountState({ ...game, counts: { ...EMPTY_COUNTS, playing: 10 } }, season)).toBe('ready');
	});
});

describe('getNoResponseCount', () => {
	it('counts members who have not answered', () => {
		expect(getNoResponseCount({ ...EMPTY_COUNTS, membersIn: 4, membersOut: 2 }, 12)).toBe(6);
	});

	it('never goes negative when the roster shrinks after responses land', () => {
		expect(getNoResponseCount({ ...EMPTY_COUNTS, membersIn: 8, membersOut: 2 }, 5)).toBe(0);
	});
});

describe('getSilentMembers', () => {
	const withMembers = (memberUids: string[]) => ({ memberUids });

	it('returns members with no response at all', () => {
		expect(getSilentMembers(withMembers(['member-a', 'member-b']), [])).toEqual(['member-a', 'member-b']);
	});

	it('drops a member the moment they answer, in or out', () => {
		const responses = [response({ uid: 'member-a', status: 'in' }), response({ uid: 'member-b', status: 'out' })];

		expect(getSilentMembers(withMembers(['member-a', 'member-b', 'member-c']), responses)).toEqual(['member-c']);
	});

	// An extra was never asked, so their silence isn't the reminder's business.
	it('ignores an extra who never responded', () => {
		expect(getSilentMembers(withMembers(['member-a']), [response({ uid: 'extra-1', status: 'in' })])).toEqual([
			'member-a',
		]);
	});

	it('is empty once every member has answered', () => {
		const responses = [response({ uid: 'member-a' }), response({ uid: 'member-b' })];

		expect(getSilentMembers(withMembers(['member-a', 'member-b']), responses)).toEqual([]);
	});
});

describe('getFormat', () => {
	it.each([
		[7, null],
		[8, '4v4'],
		[10, '5v5'],
		[11, '5v5'],
		[12, '3 teams · 4 a side'],
		[14, '3 teams · 4–5 a side'],
		[15, '3 teams · 5 a side'],
		[20, '4 teams · 5 a side'],
		[30, '4 teams · 7–8 a side'],
	])('%i players is %s', (playing, expected) => {
		expect(getFormat(playing)).toBe(expected);
	});
});

describe('getRole', () => {
	it('recognises a season member', () => {
		expect(getRole('member-a', season)).toBe('member');
	});

	it('treats everyone else as an extra', () => {
		expect(getRole('stranger', season)).toBe('extra');
	});
});

describe('isConfirmed', () => {
	it('always confirms members', () => {
		expect(isConfirmed({ role: 'member', confirmOverride: false })).toBe(true);
	});

	it('leaves an extra unconfirmed until an admin says otherwise', () => {
		expect(isConfirmed({ role: 'extra' })).toBe(false);
	});

	it('confirms an extra an admin has waved through', () => {
		expect(isConfirmed({ role: 'extra', confirmOverride: true })).toBe(true);
	});

	it('respects an admin dropping an extra', () => {
		expect(isConfirmed({ role: 'extra', confirmOverride: false })).toBe(false);
	});
});

describe('isAbsent', () => {
	it('is true for somebody who said in and a season admin reported as a no-show', () => {
		expect(isAbsent({ status: 'in', absent: true })).toBe(true);
	});

	it('is false with no mark on the response at all', () => {
		expect(isAbsent({ status: 'in' })).toBe(false);
	});

	// A mark left behind by somebody who was reported absent and then changed
	// their answer must not make an `out` read as a no-show.
	it('is false once they have said they are out', () => {
		expect(isAbsent({ status: 'out', absent: true })).toBe(false);
	});
});

describe('canReportAbsence', () => {
	// Before kick-off "they haven't turned up" describes everybody, including
	// the eight people parking.
	it.each(['open', 'locked'] as const)('is false while the game is %s', lifecycle => {
		expect(canReportAbsence(lifecycle)).toBe(false);
	});

	it.each(['live', 'finished'] as const)('is true once the game is %s', lifecycle => {
		expect(canReportAbsence(lifecycle)).toBe(true);
	});

	it('is false for a cancelled game, which nobody could fail to turn up to', () => {
		expect(canReportAbsence('cancelled')).toBe(false);
	});
});

describe('getAbsentUids', () => {
	it('names everybody reported as a no-show and nobody else', () => {
		expect(
			getAbsentUids([
				response({ uid: 'anna', status: 'in', absent: true }),
				response({ uid: 'pedro', status: 'in' }),
				response({ uid: 'sofia', status: 'out', absent: true }),
			])
		).toEqual(['anna']);
	});
});

describe('sortResponses', () => {
	it('puts members first, then confirmed extras, then by signup time', () => {
		const sorted = sortResponses([
			response({ uid: 'extra-late', confirmOverride: true, respondedAt: '2026-08-30T12:00:00.000Z' }),
			response({ uid: 'extra-dropped', confirmOverride: false }),
			response({ uid: 'member-b', role: 'member', respondedAt: '2026-08-30T11:00:00.000Z' }),
			response({ uid: 'extra-early', confirmOverride: true, respondedAt: '2026-08-30T09:00:00.000Z' }),
			response({ uid: 'member-a', role: 'member', respondedAt: '2026-08-30T08:00:00.000Z' }),
		]);

		expect(sorted.map(r => r.uid)).toEqual(['member-a', 'member-b', 'extra-early', 'extra-late', 'extra-dropped']);
	});

	it('breaks exact ties by uid so every client agrees', () => {
		const sorted = sortResponses([response({ uid: 'zoe' }), response({ uid: 'adam' })]);

		expect(sorted.map(r => r.uid)).toEqual(['adam', 'zoe']);
	});

	it('does not mutate its input', () => {
		const input = [response({ uid: 'zoe' }), response({ uid: 'adam' })];
		sortResponses(input);

		expect(input.map(r => r.uid)).toEqual(['zoe', 'adam']);
	});
});

describe('isWatchable', () => {
	// Wider than `open` deliberately: past the deadline a season admin can still
	// move the roster, which is exactly when somebody counting on a lift cares.
	it('covers every game an answer could still move on', () => {
		expect(isWatchable('open')).toBe(true);
		expect(isWatchable('locked')).toBe(true);
		expect(isWatchable('live')).toBe(true);
	});

	it('stops at a game that is off or already played', () => {
		expect(isWatchable('cancelled')).toBe(false);
		expect(isWatchable('finished')).toBe(false);
	});
});

describe('groupGames', () => {
	const played = { ...game, id: 'played', kickoff: '2026-08-25T17:00:00.000Z', endsAt: '2026-08-25T18:30:00.000Z' };
	const older = { ...game, id: 'older', kickoff: '2026-08-18T17:00:00.000Z', endsAt: '2026-08-18T18:30:00.000Z' };
	const later = { ...game, id: 'later', kickoff: '2026-09-08T17:00:00.000Z', endsAt: '2026-09-08T18:30:00.000Z' };
	const tuesday = { ...game, id: 'tuesday' };
	const games = [older, played, tuesday, later] as Game[];

	// Kickoff order in, so the top card is the game people opened the app for
	// and everything behind us reads most recent first.
	const now = new Date('2026-08-28T12:00:00Z');

	it('puts the soonest game that has not ended on top', () => {
		const groups = groupGames(games, season, now);

		expect(groups.next?.id).toBe('tuesday');
		expect(groups.upcoming.map(entry => entry.id)).toEqual(['later']);
	});

	it('lists the games behind us most recent first', () => {
		expect(groupGames(games, season, now).played.map(entry => entry.id)).toEqual(['played', 'older']);
	});

	// The whole point: a two-day vote inside a list that is collapsed by default
	// is a vote nobody sees.
	it('keeps a played game out of the archive while its vote is open', () => {
		const voting = [{ ...played, motmVotingUntilMillis: new Date('2026-08-30T12:00:00Z').getTime() }] as Game[];
		const groups = groupGames(voting, season, now);

		expect(groups.voting.map(entry => entry.id)).toEqual(['played']);
		expect(groups.played).toEqual([]);
	});

	// It waits its turn rather than taking the top card — the next game is still
	// the thing the screen is for.
	it('does not let a game awaiting its vote displace the next one', () => {
		const voting = [
			{ ...played, motmVotingUntilMillis: new Date('2026-08-30T12:00:00Z').getTime() },
			tuesday,
		] as Game[];

		expect(groupGames(voting, season, now).next?.id).toBe('tuesday');
	});

	it('archives it the moment the count deletes the window', () => {
		const counted = [{ ...played, motmVotingUntilMillis: undefined }] as Game[];
		const groups = groupGames(counted, season, now);

		expect(groups.voting).toEqual([]);
		expect(groups.played.map(entry => entry.id)).toEqual(['played']);
	});

	// A vote that never opened is not something to wait on: an unconfirmed game
	// is archived from the final whistle, exactly as it always was.
	it('archives a game whose voting window has already passed', () => {
		const stale = [{ ...played, motmVotingUntilMillis: new Date('2026-08-27T12:00:00Z').getTime() }] as Game[];

		expect(groupGames(stale, season, now).played.map(entry => entry.id)).toEqual(['played']);
	});

	// A cancellation is exactly what people open the app to find out, so it is
	// still the card on top rather than something tidied away.
	it('leaves a cancelled game ahead of us', () => {
		const cancelled = [{ ...tuesday, status: 'cancelled' }] as Game[];
		const groups = groupGames(cancelled, season, now);

		expect(groups.next?.id).toBe('tuesday');
		expect(groups.played).toEqual([]);
	});

	it('has nothing on top when every game has been played', () => {
		const groups = groupGames([older, played] as Game[], season, now);

		expect(groups.next).toBeNull();
		expect(groups.upcoming).toEqual([]);
	});
});

describe('findLiveGame', () => {
	const kickedOff = new Date('2026-09-01T17:30:00Z');
	const games = [
		{ ...game, id: 'earlier', kickoff: '2026-08-25T17:00:00.000Z', endsAt: '2026-08-25T18:30:00.000Z' },
		{ ...game, id: 'tonight' },
	] as Game[];
	const inTonight: Record<string, Pick<GameResponse, 'status'>> = { tonight: { status: 'in' } };

	it('finds the game in progress that they answered In to', () => {
		expect(findLiveGame(games, season, inTonight, kickedOff)?.id).toBe('tonight');
	});

	// The point of the whole thing: somebody who is not at this game gets left
	// exactly where they are.
	it('ignores a live game they said Out to, or never answered', () => {
		expect(findLiveGame(games, season, { tonight: { status: 'out' } }, kickedOff)).toBeNull();
		expect(findLiveGame(games, season, {}, kickedOff)).toBeNull();
	});

	it.each([
		['before kickoff', '2026-09-01T16:00:00Z'],
		['after the final whistle', '2026-09-01T19:00:00Z'],
	])('finds nothing %s', (_when, now) => {
		expect(findLiveGame(games, season, inTonight, new Date(now))).toBeNull();
	});

	// A game called off doesn't become live at kickoff, so nobody is sent to it.
	it('ignores a cancelled game at its own kickoff time', () => {
		const cancelled = [{ ...games[1], status: 'cancelled' }] as Game[];

		expect(findLiveGame(cancelled, season, inTonight, kickedOff)).toBeNull();
	});

	// Answers to other games are not answers to this one.
	it('does not match a response belonging to a different game', () => {
		expect(findLiveGame(games, season, { earlier: { status: 'in' } }, kickedOff)).toBeNull();
	});
});

describe('getAvailabilityChange', () => {
	it('reads a first answer as that answer', () => {
		expect(getAvailabilityChange(undefined, response({ status: 'in' }))).toBe('in');
		expect(getAvailabilityChange(undefined, response({ status: 'out' }))).toBe('out');
	});

	it('reads a change of heart as the new answer', () => {
		expect(getAvailabilityChange(response({ status: 'in' }), response({ status: 'out' }))).toBe('out');
	});

	// The document going away is the "no response" state, not a gap to paper
	// over — and it is worth telling a watcher about in its own words.
	it('reads a deleted response as a withdrawal', () => {
		expect(getAvailabilityChange(response({ status: 'in' }), undefined)).toBe('withdrawn');
	});

	// `setResponse` rewrites the whole document every time, so a note edit or an
	// admin confirming an extra lands here looking exactly like an answer — and
	// a notification saying somebody's answer moved when it hasn't is the one
	// that gets muted.
	it('ignores a rewrite that left the answer where it was', () => {
		expect(getAvailabilityChange(response({ status: 'in' }), response({ status: 'in', note: 'back by 7' }))).toBe(
			null
		);
		expect(
			getAvailabilityChange(
				response({ status: 'in', role: 'extra' }),
				response({ status: 'in', role: 'extra', confirmOverride: true })
			)
		).toBe(null);
	});

	// Neither side present is a trigger that has nothing to say — the tests for
	// `onResponseWrite` build events without document data for exactly this.
	it('reads nothing on either side as nothing having happened', () => {
		expect(getAvailabilityChange(undefined, undefined)).toBe(null);
	});
});

describe('tallyResponses', () => {
	it('counts an empty game as empty', () => {
		expect(tallyResponses([])).toEqual(EMPTY_COUNTS);
	});

	it('separates members from extras and totals who is playing', () => {
		const counts = tallyResponses([
			response({ role: 'member', status: 'in' }),
			response({ role: 'member', status: 'in' }),
			response({ role: 'member', status: 'out' }),
			response({ role: 'extra', status: 'in', confirmOverride: true }),
			response({ role: 'extra', status: 'in', confirmOverride: false }),
			response({ role: 'extra', status: 'out' }),
		]);

		expect(counts).toEqual({
			membersIn: 2,
			membersOut: 1,
			extrasIn: 2,
			extrasOut: 1,
			extrasConfirmed: 1,
			playing: 3,
		});
	});

	it('excludes an extra nobody has confirmed yet', () => {
		const counts = tallyResponses([response({ role: 'extra', status: 'in' })]);

		expect(counts.extrasIn).toBe(1);
		expect(counts.extrasConfirmed).toBe(0);
		expect(counts.playing).toBe(0);
	});

	it('excludes an extra who said out even if confirmed', () => {
		const counts = tallyResponses([response({ role: 'extra', status: 'out', confirmOverride: true })]);

		expect(counts.extrasConfirmed).toBe(0);
		expect(counts.playing).toBe(0);
	});
});

describe('findCountsDrift', () => {
	const playing = (count: number) => Array.from({ length: count }, () => response({ role: 'member', status: 'in' }));

	// The state every future game in a fresh season is in. A check that flagged
	// this would report every game in the database on its first run.
	it('says nothing about an untouched game', () => {
		expect(findCountsDrift({ counts: { ...EMPTY_COUNTS }, atRisk: true }, [], 10)).toEqual([]);
	});

	it('says nothing when the stored counters match the responses', () => {
		const game = { counts: { ...EMPTY_COUNTS, membersIn: 10, playing: 10 }, atRisk: false };

		expect(findCountsDrift(game, playing(10), 10)).toEqual([]);
	});

	// The failure this exists for: a response landed, the trigger never
	// managed to write, and the game has under-reported ever since.
	it('names every counter that has fallen behind', () => {
		const game = { counts: { ...EMPTY_COUNTS, membersIn: 9, playing: 9 }, atRisk: false };

		expect(findCountsDrift(game, playing(10), 10)).toEqual([
			{ field: 'membersIn', stored: 9, actual: 10 },
			{ field: 'playing', stored: 9, actual: 10 },
		]);
	});

	// `atRisk` is what decides whether a push goes out at all, so it is checked
	// against the same comparison the trigger makes rather than against itself.
	it('catches an at-risk flag that never flipped', () => {
		const game = { counts: { ...EMPTY_COUNTS, membersIn: 4, playing: 4 }, atRisk: false };

		expect(findCountsDrift(game, playing(4), 10)).toEqual([{ field: 'atRisk', stored: false, actual: true }]);
	});

	it('catches an at-risk flag left on after the game filled up', () => {
		const game = { counts: { ...EMPTY_COUNTS, membersIn: 10, playing: 10 }, atRisk: true };

		expect(findCountsDrift(game, playing(10), 10)).toEqual([{ field: 'atRisk', stored: true, actual: false }]);
	});

	// A half-written document has to be compared, not skipped — it is exactly
	// the shape a failed trigger leaves behind.
	it('compares a counter the document is missing entirely', () => {
		expect(findCountsDrift({}, playing(2), 10)).toEqual([
			{ field: 'membersIn', stored: 0, actual: 2 },
			{ field: 'playing', stored: 0, actual: 2 },
			{ field: 'atRisk', stored: false, actual: true },
		]);
	});
});

describe('parseReminderHours', () => {
	it('reads a list as typed', () => {
		expect(parseReminderHours('72, 24')).toEqual([72, 24]);
	});

	it('sorts descending whatever order they were typed in', () => {
		expect(parseReminderHours('24,72,48')).toEqual([72, 48, 24]);
	});

	it('drops duplicates', () => {
		expect(parseReminderHours('24, 24, 72')).toEqual([72, 24]);
	});

	// Typed into a free-text field, so a trailing comma must not fail the save.
	it('ignores empty and junk entries', () => {
		expect(parseReminderHours('72, , 24, soon,')).toEqual([72, 24]);
	});

	it('ignores zero and negative windows', () => {
		expect(parseReminderHours('0, -5, 24')).toEqual([24]);
	});

	it('reads an empty field as no reminders', () => {
		expect(parseReminderHours('')).toEqual([]);
	});
});

describe('parseCount', () => {
	it('reads a whole number as typed', () => {
		expect(parseCount('90')).toBe(90);
	});

	it('refuses an empty box rather than calling it zero', () => {
		expect(parseCount('')).toBeNull();
		expect(parseCount('   ')).toBeNull();
	});

	it('refuses anything below the floor', () => {
		expect(parseCount('0')).toBeNull();
		expect(parseCount('-3')).toBeNull();
	});

	// Answers staying open right up to kick-off is a real setting, so the
	// deadline field asks for a floor of nothing rather than of one.
	it('allows zero where zero is a real answer', () => {
		expect(parseCount('0', 0)).toBe(0);
	});

	it('refuses a fraction and refuses nonsense', () => {
		expect(parseCount('7.5')).toBeNull();
		expect(parseCount('ten')).toBeNull();
	});
});
