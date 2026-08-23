import { deleteDoc, deleteField, doc, orderBy, query, updateDoc, writeBatch } from 'firebase/firestore';
import type { DocumentData, Unsubscribe } from 'firebase/firestore';
import type { Game, Season, Venue } from '@shared/types';
import { EMPTY_COUNTS } from '@shared/types';
import type { GeneratedGame } from '@shared/schedule';
import { getDb } from '../firebaseClient';
import { gameDoc, gamesCol } from './paths';
import { subscribeToCollection, subscribeToDoc } from './subscribe';

const toGame = (id: string, data: DocumentData): Game => ({ ...(data as Omit<Game, 'id'>), id });

export const subscribeToGames = (
	seasonId: string,
	onChange: (games: Game[]) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToCollection(
		query(gamesCol(seasonId), orderBy('kickoff', 'asc')),
		docs => docs.map(d => toGame(d.id, d.data())),
		onChange,
		onError
	);

export const subscribeToGame = (
	seasonId: string,
	gameId: string,
	onChange: (game: Game | null) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	subscribeToDoc(gameDoc(seasonId, gameId), snapshot => toGame(snapshot.id, snapshot.data()), onChange, onError);

const newGame = (
	season: Season,
	generated: GeneratedGame,
	createdBy: string,
	overrides: Partial<Game> = {}
): Omit<Game, 'id'> => ({
	seasonId: season.id,
	kickoff: generated.kickoff,
	// Numeric mirror of `kickoff`; security rules can't parse the ISO form, and
	// the response deadline is enforced against this.
	kickoffMillis: Date.parse(generated.kickoff),
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

/**
 * Re-snapshots `venue` onto every game that hasn't kicked off yet, so an admin
 * correcting the season's venue doesn't leave the whole calendar pointing at
 * the old address. Games already played are left alone, same reasoning as
 * `onSeasonWrite`'s roster repair: a finished game's venue is a record of
 * where it happened, not a mirror of the season's current settings.
 */
export const updateVenueForUpcomingGames = async (seasonId: string, games: Game[], venue: Venue): Promise<number> => {
	const now = Date.now();
	const upcoming = games.filter(game => game.kickoffMillis >= now);

	if (upcoming.length === 0) return 0;

	const batch = writeBatch(getDb());

	for (const game of upcoming) {
		batch.update(gameDoc(seasonId, game.id), { venue });
	}

	await batch.commit();

	return upcoming.length;
};

export const cancelGame = (seasonId: string, gameId: string, reason: string) =>
	updateDoc(gameDoc(seasonId, gameId), { status: 'cancelled', cancelledReason: reason });

/**
 * The reason is removed rather than blanked. Every reader already treats an
 * empty string as no reason, so this changes nothing today, but "no reason
 * given" then has two spellings, and which one a game carries depends on
 * whether it was ever cancelled. Absence is the state everywhere else here: no
 * response document means no response, no match document means not played.
 */
export const restoreGame = (seasonId: string, gameId: string) =>
	updateDoc(gameDoc(seasonId, gameId), { status: 'scheduled', cancelledReason: deleteField() });

export const deleteGame = (seasonId: string, gameId: string) => deleteDoc(gameDoc(seasonId, gameId));
