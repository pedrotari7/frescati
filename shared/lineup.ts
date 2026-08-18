/**
 * Editing a team sheet by hand.
 *
 * The optimizer picks the teams and it is nearly always right, but it is
 * picking from what people typed into a phone and the evening is what actually
 * happens: two of the five who said In are still on a bus, somebody's brother
 * turned up, and the split that was balanced an hour ago is now six against
 * four. `shared/optimizer.ts` answers "what is the fairest split of this pool";
 * this answers "put him over there".
 *
 * Pure and dependency-free, like the rest of `shared/`, so the callable that
 * writes the lineup and the screen that offers the buttons agree about what a
 * move does before either of them does it.
 */

import type { TournamentTeam } from './types';

/**
 * Which squad somebody is on, or `-1`.
 *
 * `-1` is a real answer here rather than a miss: somebody in the playing pool
 * who is on no squad is exactly what an admin has to be able to see and fix,
 * so it is a state the sheet can be in, not an error.
 */
export const findTeamIndex = (teams: TournamentTeam[], uid: string): number =>
	teams.findIndex(team => team.uids.includes(uid));

/**
 * The sheet with one player somewhere else — on `teamIndex`, or off it
 * entirely with `null`.
 *
 * Adding rather than only moving falls out of this for free, which is the
 * reason it is one function rather than three: a player nobody has assigned yet
 * is on no squad, and putting them on one is the same write as moving them
 * between two. It is also the only way back for somebody taken off the sheet,
 * and an operation with no inverse is one nobody dares use.
 *
 * They land at the **end** of the squad they join. There is nothing to sort by
 * — a team sheet is a set, and the rotation is what decides who is on the pitch
 * — and appending means the row that moved is the row that moved, rather than
 * quietly reordering four other people around it.
 *
 * Returns the sheet untouched when the target squad doesn't exist, so a stale
 * screen offering a Team D that has since gone cannot silently drop the player
 * it was trying to move. The callable rejects that case with a message; this is
 * the floor under it.
 */
export const withPlayerOn = (teams: TournamentTeam[], uid: string, teamIndex: number | null): TournamentTeam[] => {
	if (teamIndex !== null && !teams[teamIndex]) return teams;

	return teams.map((team, index) => ({
		...team,
		uids:
			index === teamIndex
				? [...team.uids.filter(candidate => candidate !== uid), uid]
				: team.uids.filter(candidate => candidate !== uid),
	}));
};

/**
 * Whether a squad would be emptied by taking this player out of it.
 *
 * A team with nobody on it is not a smaller team, it is a fixture against
 * nobody: `getFixtures` still pairs it up, the scoreboard still offers the
 * match, and the table still ranks it. So the last player out of a squad is
 * refused, and the way to play with fewer teams is to have fewer people say In
 * — which is the same thing that decided the count in the first place.
 */
export const wouldEmptyASquad = (teams: TournamentTeam[], uid: string): boolean => {
	const from = findTeamIndex(teams, uid);

	return from >= 0 && teams[from].uids.length === 1;
};

/**
 * Everybody in the playing pool who is on no squad, in the order the pool gave
 * them.
 *
 * Ordinarily empty: the lineup is built from the pool, so the two agree. They
 * come apart the moment an admin takes somebody off the sheet, and — more
 * quietly — when a pinned lineup stops being re-picked and somebody new says
 * In. That second case is the one worth a screen: the app has stopped putting
 * people on teams and nothing else would say so.
 */
export const getUnassigned = (teams: TournamentTeam[], poolUids: string[]): string[] => {
	const assigned = new Set(teams.flatMap(team => team.uids));

	return poolUids.filter(uid => !assigned.has(uid));
};
