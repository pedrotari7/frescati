import { increment, onSnapshot, updateDoc } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import type { TournamentTeams } from '@shared/types';
import { gameDoc, tournamentTeamsDoc } from './paths';

export const subscribeToTeams = (
	seasonId: string,
	gameId: string,
	onChange: (teams: TournamentTeams | null) => void,
	onError: (error: Error) => void
): Unsubscribe =>
	onSnapshot(
		tournamentTeamsDoc(seasonId, gameId),
		snapshot => onChange(snapshot.exists() ? (snapshot.data() as TournamentTeams) : null),
		onError
	);

/**
 * Ask for a different split of the same players.
 *
 * Bumps a counter on the game rather than writing a lineup: the teams document
 * is function-only, which is what guarantees nobody can hand-pick a side. The
 * counter feeds the optimiser's seed, so this re-rolls rather than re-runs — the
 * new teams will be just as balanced, and different.
 *
 * `increment` rather than a read-then-write so two admins tapping at once
 * produce two rolls instead of silently one.
 */
export const reshuffleTeams = (seasonId: string, gameId: string) =>
	updateDoc(gameDoc(seasonId, gameId), { reshuffleCount: increment(1) });
