import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import type { TournamentTeams } from '../../shared/types';
import { isConfirmed } from '../../shared/game';
import { findTeamIndex, withPlayerOn, wouldEmptyASquad } from '../../shared/lineup';
import { getElo, getSeedElo } from '../../shared/rating';
import { db, REGION } from './lib/firebase';
import { requireSeasonAdmin } from './lib/auth';
import { getGame, getProfiles, getResponses, getSeason } from './lib/data';
import { instrument } from './lib/sentry';

/**
 * Moving somebody by hand.
 *
 * The optimizer picks from what people typed into a phone during the week; the
 * admin is standing on the touchline at five past seven, where two of the
 * eleven who said In are still on a bus and somebody's brother has turned up in
 * boots. Everything else here is built so that no human has to hold the lineup
 * together — this is the one door out of that, for the evenings where it has
 * gone wrong anyway.
 *
 * A callable rather than a rule loosened for season admins, for the reason the
 * rules file already gives: `tournament/teams` is writable by nobody at all,
 * and that is what guarantees a player cannot quietly move themselves onto the
 * side they fancy. Loosening it would mean the rule can no longer say "never" —
 * and the checks below, a squad that cannot be emptied and a player who has to
 * be in the pool, are ones CEL cannot express against a list of maps anyway.
 *
 * **Editing pins the lineup.** `TournamentTeams.edited` is what `runTeamRebuild`
 * reads to leave a hand-picked sheet alone; without it the next person to change
 * their mind would silently re-pick the teams the admin has just sorted out,
 * from a screen nobody is looking at. Reshuffle is the way back.
 */

/**
 * What a newly added player is worth to the team-average badge.
 *
 * `elos` on the lineup is a snapshot for display — the ratings a result is
 * computed from are read live at confirmation — but a *missing* entry reads as
 * a real zero on the card and drags the squad average down with it, which is a
 * worse lie than a rating twenty minutes out of date. So somebody arriving on a
 * sheet gets the number the optimizer would have given them: their own rating,
 * or the season's live average if they have none.
 */
const getDisplayElo = async (seasonId: string, uid: string): Promise<number> => {
	const season = await getSeason(seasonId);
	if (!season) return getSeedElo([]);

	const users = await getProfiles([...new Set([...season.memberUids, uid])]);

	const seedElo = getSeedElo(
		season.memberUids
			.map(member => users.get(member)?.rating?.elo)
			.filter((elo): elo is number => typeof elo === 'number')
	);

	return getElo(users.get(uid)?.rating, seedElo);
};

export const setPlayerTeam = onCall<{ seasonId?: string; gameId?: string; uid?: string; teamIndex?: number | null }>(
	{ region: REGION },
	instrument('setPlayerTeam', async request => {
		const { seasonId, gameId, uid, teamIndex } = request.data ?? {};

		if (!seasonId || !gameId || !uid) throw new HttpsError('invalid-argument', 'Which player, on which game?');

		// Spelled out rather than defaulted, because the default would be "take
		// them off the sheet" — the one outcome a caller that forgot the field
		// least wants.
		if (teamIndex !== null && !Number.isInteger(teamIndex)) {
			throw new HttpsError('invalid-argument', 'A team index, or null to take them off the sheet.');
		}

		const to = teamIndex ?? null;

		const callerUid = await requireSeasonAdmin(
			request,
			seasonId,
			'Only a season admin can move players between teams.'
		);

		const game = await getGame(seasonId, gameId);
		if (!game) throw new HttpsError('not-found', 'That game has gone.');

		// The ledger was computed against this sheet and a replay reads it back,
		// so moving somebody now would rewrite what a past game meant. The same
		// freeze `runTeamRebuild` respects, and the reason a correction to a
		// confirmed game is a scoreline rather than a lineup.
		if (game.resultFinalisedAt) {
			throw new HttpsError('failed-precondition', 'The teams are frozen now the game is confirmed.');
		}

		const teamsRef = db.doc(`seasons/${seasonId}/games/${gameId}/tournament/teams`);
		const lineup = (await teamsRef.get()).data() as TournamentTeams | undefined;

		if (!lineup || lineup.teams.length === 0) {
			throw new HttpsError('failed-precondition', 'There are no teams to move anybody between yet.');
		}

		if (to !== null && !lineup.teams[to]) throw new HttpsError('invalid-argument', 'There is no team there.');

		const from = findTeamIndex(lineup.teams, uid);

		// A squad with nobody in it is not a smaller squad: the rotation still
		// pairs it up, the scoreboard still offers the match and the table still
		// ranks it. Fewer teams comes from fewer people saying In.
		if (from !== to && wouldEmptyASquad(lineup.teams, uid)) {
			throw new HttpsError('failed-precondition', 'That would leave a team with nobody on it.');
		}

		// Onto the sheet only from the pool the optimizer picks from, so the two
		// cannot drift into disagreeing about who is playing. Somebody already on
		// the sheet is exempt: a pinned lineup stops being re-picked, so a player
		// who has since tapped Out is still standing there in boots and still has
		// to be movable — which is exactly the mess this exists to sort out.
		if (to !== null && from < 0) {
			const responses = await getResponses(seasonId, gameId);
			const response = responses.find(candidate => candidate.uid === uid);

			if (!response || response.status !== 'in' || !isConfirmed(response)) {
				throw new HttpsError('failed-precondition', 'They have to be in for this game before they get a team.');
			}
		}

		// `set` with a merge rather than an `update`, so the one new `elos` key is
		// merged into the map instead of replacing it — and without a dotted field
		// path, which a uid is not always legal inside.
		await teamsRef.set(
			{
				teams: withPlayerOn(lineup.teams, uid, to),
				...(to !== null && lineup.elos[uid] === undefined
					? { elos: { [uid]: await getDisplayElo(seasonId, uid) } }
					: {}),
				edited: { by: callerUid, at: new Date().toISOString() },
			},
			{ merge: true }
		);

		logger.info('Moved a player by hand', { seasonId, gameId, uid, from, to, by: callerUid });

		return { ok: true };
	})
);
