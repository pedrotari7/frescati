'use client';

import type {
	AppUser,
	Game,
	GameResponse,
	KitItem,
	MotmVote,
	Season,
	RatingLedgerEntry,
	TournamentMatch,
	TournamentMotm,
	TournamentResult,
	TournamentTeams,
} from '@shared/types';
import { subscribeToSeason, subscribeToSeasons } from '../lib/db/seasons';
import { subscribeToGame, subscribeToGames } from '../lib/db/games';
import { subscribeToResponses } from '../lib/db/responses';
import { subscribeToKit } from '../lib/db/kit';
import { subscribeToWatching } from '../lib/db/watchers';
import {
	subscribeToMatches,
	subscribeToPlayerLedger,
	subscribeToResult,
	subscribeToSeasonLedger,
	subscribeToTeams,
} from '../lib/db/tournament';
import { subscribeToMotm, subscribeToMotmVoters, subscribeToMyMotmVote } from '../lib/db/motm';
import { subscribeToUser, subscribeToUsers } from '../lib/db/users';
import { useFirestoreSubscription } from './useFirestoreSubscription';

const NO_SEASONS: Season[] = [];
const NO_GAMES: Game[] = [];
const NO_RESPONSES: GameResponse[] = [];
const NO_USERS: AppUser[] = [];
const NO_MATCHES: TournamentMatch[] = [];
const NO_LEDGER: RatingLedgerEntry[] = [];
const NO_KIT: KitItem[] = [];
const NO_VOTERS: string[] = [];

export const useSeasons = () => {
	const { data, loading, error } = useFirestoreSubscription<Season[]>(
		NO_SEASONS,
		(onChange, onError) => subscribeToSeasons(onChange, onError),
		[],
		'seasons'
	);

	return { seasons: data, loading, error };
};

export const useSeason = (seasonId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<Season | null>(
		null,
		seasonId ? (onChange, onError) => subscribeToSeason(seasonId, onChange, onError) : null,
		[seasonId],
		'season'
	);

	return { season: data, loading, error };
};

export const useGames = (seasonId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<Game[]>(
		NO_GAMES,
		seasonId ? (onChange, onError) => subscribeToGames(seasonId, onChange, onError) : null,
		[seasonId],
		'games'
	);

	return { games: data, loading, error };
};

export const useGame = (seasonId: string | null, gameId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<Game | null>(
		null,
		seasonId && gameId ? (onChange, onError) => subscribeToGame(seasonId, gameId, onChange, onError) : null,
		[seasonId, gameId],
		'game'
	);

	return { game: data, loading, error };
};

export const useResponses = (seasonId: string | null, gameId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<GameResponse[]>(
		NO_RESPONSES,
		seasonId && gameId ? (onChange, onError) => subscribeToResponses(seasonId, gameId, onChange, onError) : null,
		[seasonId, gameId],
		'responses'
	);

	return { responses: data, loading, error };
};

/**
 * Whether you are following this game's availability.
 *
 * Starts `false` rather than `null`: the toggle has to draw something before
 * the first snapshot lands, and off is both the default and the safe thing to
 * show — an on switch that flicks off a moment later reads as a lost setting.
 */
export const useWatching = (seasonId: string | null, gameId: string | null, uid: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<boolean>(
		false,
		seasonId && gameId && uid
			? (onChange, onError) => subscribeToWatching(seasonId, gameId, uid, onChange, onError)
			: null,
		[seasonId, gameId, uid],
		'watching'
	);

	return { watching: data, loading, error };
};

/**
 * What the season owns and who has it.
 *
 * Subscribed where it's needed rather than hoisted into `SeasonProvider`, on
 * the same reasoning `NextGameHero` subscribes to its own responses: the
 * provider holds what every screen under /s/ reads to draw its chrome, and only
 * three of them ever ask about kit. A register is a handful of documents, so a
 * listener that comes and goes with the screen costs less than one every screen
 * carries whether or not it looks at it.
 */
export const useKit = (seasonId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<KitItem[]>(
		NO_KIT,
		seasonId ? (onChange, onError) => subscribeToKit(seasonId, onChange, onError) : null,
		[seasonId],
		'kit'
	);

	return { kit: data, loading, error };
};

export const useUsers = () => {
	const { data, loading, error } = useFirestoreSubscription<AppUser[]>(
		NO_USERS,
		(onChange, onError) => subscribeToUsers(onChange, onError),
		[],
		'users'
	);

	return { users: data, loading, error };
};

export const useTournamentTeams = (seasonId: string | null, gameId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<TournamentTeams | null>(
		null,
		seasonId && gameId ? (onChange, onError) => subscribeToTeams(seasonId, gameId, onChange, onError) : null,
		[seasonId, gameId],
		'tournamentTeams'
	);

	return { teams: data, loading, error };
};

export const useMatches = (seasonId: string | null, gameId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<TournamentMatch[]>(
		NO_MATCHES,
		seasonId && gameId ? (onChange, onError) => subscribeToMatches(seasonId, gameId, onChange, onError) : null,
		[seasonId, gameId],
		'tournamentMatches'
	);

	return { matches: data, loading, error };
};

export const useTournamentResult = (seasonId: string | null, gameId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<TournamentResult | null>(
		null,
		seasonId && gameId ? (onChange, onError) => subscribeToResult(seasonId, gameId, onChange, onError) : null,
		[seasonId, gameId],
		'tournamentResult'
	);

	return { result: data, loading, error };
};

/**
 * The counted man-of-the-match vote, or `null` while it is still open.
 *
 * `null` covers a game nobody has confirmed as well as one still being voted
 * on; the window on the game document is what tells those apart.
 */
export const useMotm = (seasonId: string | null, gameId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<TournamentMotm | null>(
		null,
		seasonId && gameId ? (onChange, onError) => subscribeToMotm(seasonId, gameId, onChange, onError) : null,
		[seasonId, gameId],
		'motm'
	);

	return { motm: data, loading, error };
};

/**
 * Who has voted, while the vote is open. Never who they voted for — that is the
 * one thing about it nobody may see until it closes.
 *
 * Empty covers both ends of it: nobody has answered yet, and a vote that has
 * been counted, whose turnout is in the published totals instead.
 */
export const useMotmVoters = (seasonId: string | null, gameId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<string[]>(
		NO_VOTERS,
		seasonId && gameId ? (onChange, onError) => subscribeToMotmVoters(seasonId, gameId, onChange, onError) : null,
		[seasonId, gameId],
		'motmVoters'
	);

	return { voterUids: data, loading, error };
};

/** Your own vote. Nobody else's is readable, deliberately. */
export const useMyMotmVote = (seasonId: string | null, gameId: string | null, uid: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<MotmVote | null>(
		null,
		seasonId && gameId && uid
			? (onChange, onError) => subscribeToMyMotmVote(seasonId, gameId, uid, onChange, onError)
			: null,
		[seasonId, gameId, uid],
		'motmVote'
	);

	return { vote: data, loading, error };
};

export const useSeasonLedger = (seasonId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<RatingLedgerEntry[]>(
		NO_LEDGER,
		seasonId ? (onChange, onError) => subscribeToSeasonLedger(seasonId, onChange, onError) : null,
		[seasonId],
		'seasonLedger'
	);

	return { entries: data, loading, error };
};

/** Every rated game one player has appeared in, whatever season it was in. */
export const usePlayerLedger = (uid: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<RatingLedgerEntry[]>(
		NO_LEDGER,
		uid ? (onChange, onError) => subscribeToPlayerLedger(uid, onChange, onError) : null,
		[uid],
		'playerLedger'
	);

	return { entries: data, loading, error };
};

export const useUser = (uid: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<AppUser | null>(
		null,
		uid ? (onChange, onError) => subscribeToUser(uid, onChange, onError) : null,
		[uid],
		'user'
	);

	return { user: data, loading, error };
};
