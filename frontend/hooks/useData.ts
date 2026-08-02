'use client';

import type { AppUser, Game, GameResponse, Season } from '@shared/types';
import { subscribeToSeason, subscribeToSeasons } from '../lib/db/seasons';
import { subscribeToGame, subscribeToGames } from '../lib/db/games';
import { subscribeToResponses } from '../lib/db/responses';
import { subscribeToUser, subscribeToUsers } from '../lib/db/users';
import { useFirestoreSubscription } from './useFirestoreSubscription';

const NO_SEASONS: Season[] = [];
const NO_GAMES: Game[] = [];
const NO_RESPONSES: GameResponse[] = [];
const NO_USERS: AppUser[] = [];

export const useSeasons = () => {
	const { data, loading, error } = useFirestoreSubscription<Season[]>(
		NO_SEASONS,
		(onChange, onError) => subscribeToSeasons(onChange, onError),
		[]
	);

	return { seasons: data, loading, error };
};

export const useSeason = (seasonId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<Season | null>(
		null,
		seasonId ? (onChange, onError) => subscribeToSeason(seasonId, onChange, onError) : null,
		[seasonId]
	);

	return { season: data, loading, error };
};

export const useGames = (seasonId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<Game[]>(
		NO_GAMES,
		seasonId ? (onChange, onError) => subscribeToGames(seasonId, onChange, onError) : null,
		[seasonId]
	);

	return { games: data, loading, error };
};

export const useGame = (seasonId: string | null, gameId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<Game | null>(
		null,
		seasonId && gameId ? (onChange, onError) => subscribeToGame(seasonId, gameId, onChange, onError) : null,
		[seasonId, gameId]
	);

	return { game: data, loading, error };
};

export const useResponses = (seasonId: string | null, gameId: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<GameResponse[]>(
		NO_RESPONSES,
		seasonId && gameId ? (onChange, onError) => subscribeToResponses(seasonId, gameId, onChange, onError) : null,
		[seasonId, gameId]
	);

	return { responses: data, loading, error };
};

export const useUsers = () => {
	const { data, loading, error } = useFirestoreSubscription<AppUser[]>(
		NO_USERS,
		(onChange, onError) => subscribeToUsers(onChange, onError),
		[]
	);

	return { users: data, loading, error };
};

export const useUser = (uid: string | null) => {
	const { data, loading, error } = useFirestoreSubscription<AppUser | null>(
		null,
		uid ? (onChange, onError) => subscribeToUser(uid, onChange, onError) : null,
		[uid]
	);

	return { user: data, loading, error };
};
