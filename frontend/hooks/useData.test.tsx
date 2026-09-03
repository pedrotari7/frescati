import { renderHook } from '@testing-library/react';

/**
 * The guard in front of every subscription in `useData`.
 *
 * Fifteen of these hooks are the same four lines with different nouns, and each
 * one decides whether to subscribe at all from a `seasonId && gameId ? … : null`
 * written out by hand. That repetition is the whole risk: the realistic bug here
 * is not a broken subscription but a copy-paste that checks the wrong id: a
 * `useMyMotmVote` guarded on `seasonId && gameId` while it also needs a `uid`
 * would build the path `…/motmVotes/null` and read a document that cannot exist,
 * quietly, for every signed-out visitor.
 *
 * Nothing else would catch it. A page renders these with real ids, so the null
 * branch is only reached before sign-in or on a route whose params haven't
 * resolved, which is exactly where nobody is looking. So this is one table
 * rather than fifteen near-identical test files: each hook is asserted to
 * subscribe when it has everything it needs and to stay silent when any single
 * one of its inputs is missing.
 */

/**
 * Every subscription stubbed with one that returns an unsubscribe.
 *
 * A function *declaration*, and named with the `mock` prefix, because
 * `vi.mock` factories are hoisted above every `const` in the file and may only
 * reach out-of-scope identifiers whose names begin with `mock`.
 */
function mockSubscriptions(...names: string[]) {
	return Object.fromEntries(names.map(name => [name, vi.fn(() => vi.fn())]));
}

vi.mock('../lib/db/seasons', () => mockSubscriptions('subscribeToSeasons', 'subscribeToSeason'));
vi.mock('../lib/db/games', () => mockSubscriptions('subscribeToGames', 'subscribeToGame'));
vi.mock('../lib/db/responses', () => mockSubscriptions('subscribeToResponses'));
vi.mock('../lib/db/kit', () => mockSubscriptions('subscribeToKit'));
vi.mock('../lib/db/tournament', () =>
	mockSubscriptions(
		'subscribeToTeams',
		'subscribeToMatches',
		'subscribeToResult',
		'subscribeToSeasonLedger',
		'subscribeToPlayerLedger'
	)
);
vi.mock('../lib/db/motm', () =>
	mockSubscriptions('subscribeToMotm', 'subscribeToMotmVoters', 'subscribeToMyMotmVote')
);
vi.mock('../lib/db/users', () => mockSubscriptions('subscribeToUsers', 'subscribeToUser'));

import * as games from '../lib/db/games';
import * as kit from '../lib/db/kit';
import * as motm from '../lib/db/motm';
import * as responses from '../lib/db/responses';
import * as seasons from '../lib/db/seasons';
import * as tournament from '../lib/db/tournament';
import * as users from '../lib/db/users';
import * as data from './useData';
import type { Mock } from 'vitest';

const SEASON = 'season-1';
const GAME = 'game-1';
const UID = 'anna';

/**
 * Each row: the hook, the subscribe call it should reach, and the arguments it
 * needs. `subscribeWith` is what the db layer should be handed: the ids only,
 * since the two callbacks are supplied by the shared subscription hook.
 */
const HOOKS: {
	name: string;
	hook: (...args: (string | null)[]) => unknown;
	subscribe: Mock;
	args: (string | null)[];
	subscribeWith: string[];
}[] = [
	{
		name: 'useSeason',
		hook: data.useSeason,
		subscribe: seasons.subscribeToSeason as Mock,
		args: [SEASON],
		subscribeWith: [SEASON],
	},
	{
		name: 'useGames',
		hook: data.useGames,
		subscribe: games.subscribeToGames as Mock,
		args: [SEASON],
		subscribeWith: [SEASON],
	},
	{
		name: 'useKit',
		hook: data.useKit,
		subscribe: kit.subscribeToKit as Mock,
		args: [SEASON],
		subscribeWith: [SEASON],
	},
	{
		name: 'useSeasonLedger',
		hook: data.useSeasonLedger,
		subscribe: tournament.subscribeToSeasonLedger as Mock,
		args: [SEASON],
		subscribeWith: [SEASON],
	},
	{
		name: 'useUser',
		hook: data.useUser,
		subscribe: users.subscribeToUser as Mock,
		args: [UID],
		subscribeWith: [UID],
	},
	{
		name: 'usePlayerLedger',
		hook: data.usePlayerLedger,
		subscribe: tournament.subscribeToPlayerLedger as Mock,
		args: [UID],
		subscribeWith: [UID],
	},
	{
		name: 'useGame',
		hook: data.useGame,
		subscribe: games.subscribeToGame as Mock,
		args: [SEASON, GAME],
		subscribeWith: [SEASON, GAME],
	},
	{
		name: 'useResponses',
		hook: data.useResponses,
		subscribe: responses.subscribeToResponses as Mock,
		args: [SEASON, GAME],
		subscribeWith: [SEASON, GAME],
	},
	{
		name: 'useTournamentTeams',
		hook: data.useTournamentTeams,
		subscribe: tournament.subscribeToTeams as Mock,
		args: [SEASON, GAME],
		subscribeWith: [SEASON, GAME],
	},
	{
		name: 'useMatches',
		hook: data.useMatches,
		subscribe: tournament.subscribeToMatches as Mock,
		args: [SEASON, GAME],
		subscribeWith: [SEASON, GAME],
	},
	{
		name: 'useTournamentResult',
		hook: data.useTournamentResult,
		subscribe: tournament.subscribeToResult as Mock,
		args: [SEASON, GAME],
		subscribeWith: [SEASON, GAME],
	},
	{
		name: 'useMotm',
		hook: data.useMotm,
		subscribe: motm.subscribeToMotm as Mock,
		args: [SEASON, GAME],
		subscribeWith: [SEASON, GAME],
	},
	{
		name: 'useMotmVoters',
		hook: data.useMotmVoters,
		subscribe: motm.subscribeToMotmVoters as Mock,
		args: [SEASON, GAME],
		subscribeWith: [SEASON, GAME],
	},
	{
		name: 'useMyMotmVote',
		hook: data.useMyMotmVote,
		subscribe: motm.subscribeToMyMotmVote as Mock,
		args: [SEASON, GAME, UID],
		subscribeWith: [SEASON, GAME, UID],
	},
];

beforeEach(() => vi.clearAllMocks());

describe('every id-gated subscription in useData', () => {
	it.each(HOOKS.map(row => [row.name, row] as const))('%s subscribes once it has what it needs', (_name, row) => {
		renderHook(() => row.hook(...row.args));

		expect(row.subscribe).toHaveBeenCalledTimes(1);
		expect(row.subscribe).toHaveBeenCalledWith(...row.subscribeWith, expect.any(Function), expect.any(Function));
	});

	/**
	 * One case per input, rather than "all null at once". A hook guarded on two
	 * of its three ids passes the all-null case and still builds a path with
	 * `null` in it the moment only the unchecked one is missing.
	 */
	const missingOne = HOOKS.flatMap(row =>
		row.args.map((_argument, index) => {
			const args = row.args.map((value, position) => (position === index ? null : value));

			return [`${row.name} (argument ${index + 1} of ${row.args.length})`, row, args] as const;
		})
	);

	it.each(missingOne)('%s does not subscribe with a missing id', (_name, row, args) => {
		renderHook(() => row.hook(...args));

		expect(row.subscribe).not.toHaveBeenCalled();
	});

	it.each(HOOKS.map(row => [row.name, row] as const))('%s stops loading rather than hanging', (_name, row) => {
		// A screen gating a skeleton on `loading` would otherwise spin forever on
		// a route whose params have not resolved.
		const { result } = renderHook(() => row.hook(...row.args.map(() => null)));

		expect((result.current as { loading: boolean }).loading).toBe(false);
	});
});

describe('the two subscriptions that need nothing', () => {
	it('useSeasons subscribes immediately', () => {
		renderHook(() => data.useSeasons());

		expect(seasons.subscribeToSeasons).toHaveBeenCalledTimes(1);
	});

	it('useUsers subscribes immediately', () => {
		// The roster is readable by anybody signed in, so there is no id to wait
		// for, which is what makes `useUsersByUid` safe to call anywhere.
		renderHook(() => data.useUsers());

		expect(users.subscribeToUsers).toHaveBeenCalledTimes(1);
	});
});
