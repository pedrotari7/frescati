import { getDoc, getDocs } from 'firebase/firestore';
import type { TournamentMatch, TournamentMotm } from '@shared/types';
import { matchesCol, tournamentMotmDoc } from './paths';

/**
 * Every rated game's counted vote and scorelines, read once.
 *
 * Reads rather than listeners, for the reason `fetchSeasonResponses` gives: a
 * recap is a finished season, opened once, and thirty subscriptions held open
 * for a story somebody taps through in a minute would be thirty listeners doing
 * nothing. A score corrected while it is open shows up the next time.
 *
 * A game whose vote has not been counted has no key in `motm`, the same absence
 * `TournamentMotm` uses to mean "not counted yet".
 */
export const fetchRecapGames = async (
	seasonId: string,
	gameIds: string[]
): Promise<{ motm: Record<string, TournamentMotm>; matches: Record<string, TournamentMatch[]> }> => {
	const games = await Promise.all(
		gameIds.map(async gameId => {
			const [motm, matches] = await Promise.all([
				getDoc(tournamentMotmDoc(seasonId, gameId)),
				getDocs(matchesCol(seasonId, gameId)),
			]);

			return {
				gameId,
				motm: motm.exists() ? (motm.data() as TournamentMotm) : null,
				matches: matches.docs.map(match => match.data() as TournamentMatch),
			};
		})
	);

	return {
		motm: Object.fromEntries(games.flatMap(game => (game.motm ? [[game.gameId, game.motm]] : []))),
		matches: Object.fromEntries(games.map(game => [game.gameId, game.matches])),
	};
};
