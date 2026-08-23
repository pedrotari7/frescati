import type { DocumentReference } from 'firebase-admin/firestore';
import type { GameCounts, GameResponse, Season } from '../../../shared/types';
import { getMinPlayers, getRole, tallyResponses } from '../../../shared/game';
import { db } from './firebase';

/**
 * Re-derive a game's counters from the responses actually stored under it.
 *
 * Transactional because the read and the write have to be one unit: concurrent
 * recounts otherwise overwrite each other with stale totals. Returns `null` when
 * the game has gone, which happens when a response write and a deletion race.
 *
 * `repairRoles` also rewrites any `role` that disagrees with the season roster.
 * That flag exists because `role` is snapshotted onto the response at write
 * time. The rules check it against real membership then, so it can't be
 * spoofed, but nothing revisits it afterwards. Change the roster and every
 * existing answer keeps the role it was written with. Leave it off for the
 * common case, where membership hasn't moved and the extra writes would be
 * pure noise.
 *
 * Roles are resolved from the document id rather than the `uid` field: the id
 * is the uid by construction, whereas the field is just data a season admin
 * could have written anything into.
 *
 * `teamsGeneration` is bumped in the same write. Anything that moves the
 * counters moves who is playing, and therefore invalidates the teams. Doing it
 * here rather than in a second transaction keeps the counters and the staleness
 * marker from ever disagreeing, which is what lets a queued rebuild trust the
 * generation it carries.
 */
export const recountGame = async (
	gameRef: DocumentReference,
	season: Season,
	{ repairRoles = false }: { repairRoles?: boolean } = {}
): Promise<{ counts: GameCounts; teamsGeneration: number } | null> =>
	db.runTransaction(async transaction => {
		const gameSnap = await transaction.get(gameRef);

		if (!gameSnap.exists) return null;

		const responsesSnap = await transaction.get(gameRef.collection('responses'));

		// Every read is done by this point, so the writes below are legal. A
		// transaction refuses any read issued after its first write.
		const responses = responsesSnap.docs.map(doc => {
			const response = doc.data() as GameResponse;
			if (!repairRoles) return response;

			const role = getRole(doc.id, season);
			if (role === response.role) return response;

			transaction.update(doc.ref, { role });

			return { ...response, role };
		});

		const counts = tallyResponses(responses);
		const game = gameSnap.data() as { minPlayers?: number; teamsGeneration?: number };
		const minimum = getMinPlayers(game, season);
		const teamsGeneration = (game.teamsGeneration ?? 0) + 1;

		transaction.update(gameRef, { counts, atRisk: counts.playing < minimum, teamsGeneration });

		return { counts, teamsGeneration };
	});
