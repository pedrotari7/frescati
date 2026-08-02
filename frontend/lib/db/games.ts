import { deleteDoc, doc, onSnapshot, orderBy, query, updateDoc, writeBatch } from 'firebase/firestore';
import type { DocumentData, Unsubscribe } from 'firebase/firestore';
import type { Game, Season, Venue } from '@shared/types';
import { EMPTY_COUNTS } from '@shared/types';
import type { GeneratedGame } from '@shared/schedule';
import { getDb } from '../firebaseClient';
import { gameDoc, gamesCol } from './paths';

const toGame = (id: string, data: DocumentData): Game => ({ ...(data as Omit<Game, 'id'>), id });

export const subscribeToGames = (
	seasonId: string,
	onChange: (games: Game[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	onSnapshot(
		query(gamesCol(seasonId), orderBy('kickoff', 'asc')),
		snapshot => onChange(snapshot.docs.map(d => toGame(d.id, d.data()))),
		onError
	);

export const subscribeToGame = (
	seasonId: string,
	gameId: string,
	onChange: (game: Game | null) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	onSnapshot(
		gameDoc(seasonId, gameId),
		snapshot => onChange(snapshot.exists() ? toGame(snapshot.id, snapshot.data()) : null),
		onError
	);

const newGame = (
	season: Season,
	generated: GeneratedGame,
	createdBy: string,
	overrides: Partial<Game> = {}
): Omit<Game, 'id'> => ({
	seasonId: season.id,
	kickoff: generated.kickoff,
	endsAt: generated.endsAt,
	venue: season.venue,
	status: 'scheduled',
	isOneOff: false,
	// A game with nobody in it is by definition short of the minimum. Rules
	// require these exact starting values so nobody can seed a fake headcount.
	counts: { ...EMPTY_COUNTS },
	atRisk: true,
	createdAt: new Date().toISOString(),
	createdBy,
	...overrides,
});

/**
 * Write a batch of generated games. Firestore batches cap at 500 writes, which
 * is comfortably above the 200-game generation ceiling.
 */
export const createGames = async (season: Season, generated: GeneratedGame[], createdBy: string): Promise<number> => {
	if (generated.length === 0) return 0;

	const batch = writeBatch(getDb());

	for (const game of generated) {
		batch.set(doc(gamesCol(season.id)), newGame(season, game, createdBy));
	}

	await batch.commit();

	return generated.length;
};

export const createOneOffGame = async (
	season: Season,
	generated: GeneratedGame,
	createdBy: string,
	venue?: Venue
): Promise<void> => {
	const batch = writeBatch(getDb());
	batch.set(
		doc(gamesCol(season.id)),
		newGame(season, generated, createdBy, { isOneOff: true, venue: venue ?? season.venue })
	);

	await batch.commit();
};

export const cancelGame = (seasonId: string, gameId: string, reason: string) =>
	updateDoc(gameDoc(seasonId, gameId), { status: 'cancelled', cancelledReason: reason });

export const restoreGame = (seasonId: string, gameId: string) =>
	updateDoc(gameDoc(seasonId, gameId), { status: 'scheduled', cancelledReason: '' });

export const deleteGame = (seasonId: string, gameId: string) => deleteDoc(gameDoc(seasonId, gameId));
