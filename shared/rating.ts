/**
 * Player ratings.
 *
 * Stored as Elo, shown as 0–100. Everything here is pure so the function that
 * applies a result and the screen that previews one agree exactly.
 *
 * The central idea: a game is a round robin between teams, and a team's
 * strength is the average of its squad. What moves your rating is the gap
 * between how your team *finished* and how it was *expected* to finish given
 * that strength. This matters more than it looks — if the balancer is doing its
 * job every team is roughly equal, so raw finishing position is close to a coin
 * flip and carries almost no information about you. Beating a stacked field
 * does.
 */

import type { PlayerRating } from './types';

/** Where a group with no history starts. Maps to 50 on the displayed scale. */
export const BASE_ELO = 1000;

/**
 * Elo either side of `BASE_ELO` that spans the full 0–100.
 *
 * The mapping is deliberately *fixed* rather than stretched across the group's
 * live spread. A relative mapping uses the scale more prettily, but it moves
 * your number on a week you did not play, which is indefensible once the number
 * is public on everyone's profile.
 */
const DISPLAY_SPAN = 250;

/** Standard Elo divisor: a 400-point gap is roughly a 10-to-1 favourite. */
const ELO_SCALE = 400;

/**
 * Elo per win of overperformance. Winning a four-team game outright against an
 * even field is worth 1.5 wins, so about 30 Elo — six points of the displayed
 * 0–100, which settles a newcomer inside a couple of months without letting one
 * good Tuesday rewrite the ladder.
 */
const K_FACTOR = 20;

/** New players swing harder so they find their level in weeks, not a season. */
const PROVISIONAL_K_FACTOR = 40;

/**
 * What being voted man of the match is worth, in Elo.
 *
 * Half a `K_FACTOR` win — two points of the displayed 0–100 — which is enough
 * to be worth winning and short of enough to outrank the football. Somebody
 * voted best on the pitch every single week gains about as much from the votes
 * as from consistently beating a stacked field, which is the balance intended:
 * this is a correction the scoreboard cannot make on its own, not a second
 * ladder running alongside the first.
 */
export const MOTM_BONUS_ELO = 10;

/** Rated games before the provisional period ends. */
export const PROVISIONAL_GAMES = 5;

/**
 * The public 0–100. Clamped, unlike the stored value: a player past the ceiling
 * still gains Elo and the balancer still tells them apart, they just read 100.
 */
export const toDisplayRating = (elo: number): number =>
	Math.max(0, Math.min(100, Math.round(50 + ((elo - BASE_ELO) / DISPLAY_SPAN) * 50)));

/**
 * The Elo behind a shown 0–100 — the inverse of `toDisplayRating` across the
 * range that function can produce.
 *
 * Exists so an admin setting somebody's starting point can type the number the
 * whole app already shows them, rather than the Elo nobody but this file sees.
 * Not an inverse outside 0–100, and can't be: the display clamps, so every Elo
 * past the ceiling reads as the same 100.
 */
export const fromDisplayRating = (display: number): number =>
	BASE_ELO + ((Math.max(0, Math.min(100, display)) - 50) / 50) * DISPLAY_SPAN;

export const isProvisional = (rating: Pick<PlayerRating, 'games'> | undefined): boolean =>
	(rating?.games ?? 0) < PROVISIONAL_GAMES;

/**
 * Whether this rating was earned on the pitch.
 *
 * A stored rating no longer implies one: an admin can set somebody's starting
 * point before their first game, which writes a real rating on `games: 0`.
 * Everywhere the question is "has the ladder had its say about this player" —
 * the all-time ladder, and whether that starting point is still an admin's to
 * change — this is the test, not the presence of the field.
 */
export const hasPlayed = (rating: Pick<PlayerRating, 'games'> | undefined): boolean => (rating?.games ?? 0) > 0;

/**
 * A starting point set by an admin rather than won.
 *
 * `games: 0` is the whole of what makes it a starting point: it keeps the
 * player off the ladder, keeps the provisional K-factor on them so their first
 * few games still move them fast, and keeps it editable until they play.
 */
export const createStartingRating = (elo: number, at: string): PlayerRating => ({ elo, games: 0, updatedAt: at });

const kFactor = (rating: PlayerRating | undefined): number => (isProvisional(rating) ? PROVISIONAL_K_FACTOR : K_FACTOR);

/**
 * What an unrated player starts on: the average of everyone in the season who
 * *is* rated, falling back to `BASE_ELO` for a group with no history at all.
 *
 * Deliberately the live average rather than a fixed number, so somebody joining
 * a strong group in week nine is not assumed to be a beginner.
 *
 * A starting rating an admin set counts towards it like any other. What this
 * average measures is how strong the group is, and somebody's considered
 * estimate of a real player is evidence about that — the alternative reads a
 * group whose ratings are all estimates as having no history at all.
 */
export const getSeedElo = (ratedElos: number[]): number =>
	ratedElos.length === 0 ? BASE_ELO : ratedElos.reduce((total, elo) => total + elo, 0) / ratedElos.length;

/** A player's Elo, seeded if they have never been rated. */
export const getElo = (rating: PlayerRating | undefined, seedElo: number): number => rating?.elo ?? seedElo;

/** A team is as strong as its squad's average. */
export const getTeamElo = (squadElos: number[]): number =>
	squadElos.length === 0 ? BASE_ELO : squadElos.reduce((total, elo) => total + elo, 0) / squadElos.length;

/** Probability that a team on `elo` beats one on `opponentElo`. */
export const getWinProbability = (elo: number, opponentElo: number): number =>
	1 / (1 + Math.pow(10, (opponentElo - elo) / ELO_SCALE));

/**
 * How many of its matches a team was expected to win, summed pairwise across
 * the field. Ranges 0 to `teams - 1`.
 *
 * Because `P(a beats b) + P(b beats a) === 1`, these always total the same as
 * the actual wins do — which is what makes the whole update zero-sum without
 * any normalisation step.
 */
export const getExpectedWins = (teamElos: number[], index: number): number =>
	teamElos.reduce(
		(total, opponentElo, other) =>
			other === index ? total : total + getWinProbability(teamElos[index], opponentElo),
		0
	);

/**
 * Position converted to the same "wins" currency as the expectation: first out
 * of four scores 3, last scores 0.
 *
 * `positions` is 0-indexed and may repeat — teams that finish level share a
 * position and take the average of the scores their places cover, so a two-way
 * tie for first in a four-team game gives both 2.5 rather than inventing a
 * winner.
 */
export const getActualWins = (positions: number[]): number[] => {
	const teamCount = positions.length;
	const sharedBy = positions.map(position => positions.filter(other => other === position).length);

	return positions.map((position, index) => {
		// The places this tie covers, scored high-to-low, then averaged.
		const places = Array.from({ length: sharedBy[index] }, (_, offset) => teamCount - 1 - (position + offset));

		return places.reduce((total, place) => total + place, 0) / sharedBy[index];
	});
};

export interface RatingInput {
	uid: string;
	rating: PlayerRating | undefined;
	/** Index into the team arrays. */
	team: number;
}

export interface RatingChange {
	uid: string;
	before: number;
	after: number;
	delta: number;
}

/**
 * The rating changes for one game.
 *
 * Every player in a squad moves by the same amount — minutes played are not
 * tracked, and a rolling sub contributed to the result as much as anyone.
 *
 * Provisional players move further than the rest, which means a game
 * containing one is not exactly zero-sum. The drift is small and it buys new
 * players a fast, honest starting point; the alternative is rescaling everyone
 * else's change to compensate, which is impossible to explain to the person it
 * happens to.
 */
export const getRatingChanges = (players: RatingInput[], positions: number[], seedElo: number): RatingChange[] => {
	const teamCount = positions.length;

	const squadElos: number[][] = Array.from({ length: teamCount }, () => []);
	for (const player of players) squadElos[player.team]?.push(getElo(player.rating, seedElo));

	const teamElos = squadElos.map(getTeamElo);
	const actualWins = getActualWins(positions);

	// Overperformance, in wins. Against an evenly matched field this collapses
	// to the plain position score — a four-team game pays +1.5 / +0.5 / -0.5 /
	// -1.5, a two-team game half a win either way — because every team's
	// expectation is then exactly the average. More teams move a rating further,
	// which is right: a six-match round robin says more about you than one game.
	const teamSwing = teamElos.map((_, index) => actualWins[index] - getExpectedWins(teamElos, index));

	return players.map(player => {
		const before = getElo(player.rating, seedElo);
		const delta = kFactor(player.rating) * teamSwing[player.team];

		return { uid: player.uid, before, after: before + delta, delta };
	});
};

/**
 * Pay the man-of-the-match bonus out of the game it was won in.
 *
 * The pot is `MOTM_BONUS_ELO` and it is **funded by everybody who played**,
 * winner included, in equal shares. So the group's average rating does not move
 * — which matters more here than anywhere else in this file, because the
 * displayed 0–100 is mapped from a *fixed* Elo span: a bonus minted from
 * nowhere every week would drift the whole group up the scale over a season and
 * everybody's number would creep without anybody playing better. What man of
 * the match says is that this player was better than the rest of them that
 * evening, and that is a statement about the difference, not the level.
 *
 * A tie splits the pot rather than the coin. Two names on the sheet is a
 * divided vote and worth less each, the same way `getActualWins` splits the
 * places a tie covers instead of inventing a winner.
 *
 * Applied after `getRatingChanges` rather than inside it, so the football and
 * the vote stay separately explicable — the screen shows one movement, but the
 * two halves of it are computed where they belong, and a game whose vote never
 * closed simply never has this called on it.
 *
 * A winner who isn't in `changes` — voted for and then dropped from the lineup
 * by a reshuffle — pays in like everyone else and takes nothing out, which
 * would leave the pot half-distributed. So the funding is worked out from the
 * winners actually present, and an empty list is left entirely alone.
 */
export const applyMotmBonus = (changes: RatingChange[], winners: string[]): RatingChange[] => {
	const paid = winners.filter(uid => changes.some(change => change.uid === uid));

	if (paid.length === 0 || changes.length === 0) return changes;

	const share = MOTM_BONUS_ELO / paid.length;
	const levy = MOTM_BONUS_ELO / changes.length;

	return changes.map(change => {
		const adjustment = (paid.includes(change.uid) ? share : 0) - levy;

		return { ...change, after: change.after + adjustment, delta: change.delta + adjustment };
	});
};

/** Apply a change, producing the rating to store. */
export const applyRatingChange = (
	rating: PlayerRating | undefined,
	change: RatingChange,
	at: string
): PlayerRating => ({
	elo: change.after,
	games: (rating?.games ?? 0) + 1,
	updatedAt: at,
});
