/**
 * Player ratings.
 *
 * Stored as Elo, shown as 0–100. Everything here is pure so the function that
 * applies a result and the screen that previews one agree exactly.
 *
 * The central idea: a game is a round robin between teams, and a team's
 * strength is the average of its squad. What moves your rating is the gap
 * between how much your team *won* and how much it was *expected* to win given
 * that strength. This matters more than it looks. If the balancer is doing its
 * job every team is roughly equal, so the result carries information about you
 * only to the extent it beat the expectation. Beating a stacked field does.
 *
 * "How much you won" is a **rate** over the matches you actually played, where
 * each match scores half on the result and half on the share of the goals, as
 * `RESULT_WEIGHT` sets out. That is the same currency `getWinProbability` returns, so the
 * two sides of the comparison are directly subtractable and the whole update is
 * zero-sum without a normalisation step. It is also bounded 0–1 whatever the
 * team count, which is what stops a three-team evening moving a rating twice as
 * far as a two-team one for no reason anybody could defend: three teams play
 * more matches, not a longer slot.
 *
 * The scoreline half is what stops a two-team evening, which is one match and
 * so a result of 1, 0.5 or 0 and nothing else, paying a 14-13 what it pays a
 * 14-0.
 *
 * A fifth of the swing is set aside for **where you finished** rather than how
 * much you won, and that part is raw position. See `RATE_WEIGHT`. It is what
 * makes the team that wins the table always gain more than the team level with
 * it on points, which a pure rate cannot do: two squads with the same record are
 * the same number, and one of them has the trophy.
 */

import type { PlayerRating, TournamentMatch } from './types';

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
 * Elo per unit of overperformance, where one unit is sweeping an evening you
 * were expected to draw, and sweeping it by enough that the scoreline has
 * nothing left to add, which is now part of what the perfect evening means.
 *
 * That ceiling used to grow with the number of teams. Winning your evening was
 * worth `(teamCount - 1) / 2` units, so a three-team game paid twice a two-team
 * one and a four-team game three times, for no footballing reason at all. It is
 * now the same 0.5 whatever the team count, which is the whole change: the only
 * thing left that varies between a two-team evening and a four-team one is how
 * much of it you actually won.
 *
 * K is unchanged through that, deliberately. Equalising had to move one of the
 * two, which were 2:1 and are now 1:1, and the one held still is the **smaller**
 * one: a settled player who sweeps their evening at a distance moves two points
 * of the displayed 0–100, exactly what a two-team game already paid, and the
 * three-team game comes down to meet it rather than the other way round. Set
 * where the ordinary evening lands rather than the perfect one, that is a real
 * Tuesday of about a point, small enough that nobody's number lurches on one
 * result, and, over the weekly slot this is a ladder for, quick enough that a
 * run of good evenings still catches somebody up.
 */
const K_FACTOR = 20;

/** New players swing harder so they find their level in weeks, not a season. */
const PROVISIONAL_K_FACTOR = 40;

/**
 * How much of the swing is how much you won, leaving the rest for where you
 * finished.
 *
 * The rate is the honest measure and carries the weight. But it cannot separate
 * two teams that played identically, level on wins and draws and apart only on
 * goal difference, and one of those two won the thing. A group reading a table
 * where they finished 1st and 2nd and gained exactly the same will conclude the
 * rating is broken, and they will have a point.
 *
 * So a fifth of it is finishing place: strictly ordered, so first *always* pays
 * more than second, and shared by teams the table itself could not separate.
 * Pointedly **raw** position rather than position against expectation, unlike
 * everything else here. An expectation-adjusted ordinal can pay a strong team
 * less for winning than a weak team for coming second, which is exactly the
 * guarantee this term exists to provide. The cost is that a stacked team gets a
 * fifth of a place's worth of credit it did not earn, capped at 0.2 × 0.5 × K
 * and standing against a balancer whose job is to make sure no team is stacked.
 *
 * The rate reads goals too now, per match and heavily damped, so the two halves
 * can genuinely disagree. A team can win the table on goal difference while
 * scoring the lower rate, which is what happens when its margin came from one
 * rout and it lost the two matches either side. That makes this fifth more
 * load-bearing than it was, not less: it is the only thing here that knows who
 * actually won the thing.
 *
 * Which is why it stays a **place** and not a margin. Goal difference reaches
 * the ordinal only by deciding the order, never by deciding what first is
 * worth. The size of a win is paid for once, in the rate, on a curve that gives
 * almost nothing past the second goal.
 */
const RATE_WEIGHT = 0.8;

/**
 * How much of a single match is the result, leaving the rest for the scoreline.
 *
 * Not to be confused with `RATE_WEIGHT` one level up: that splits the *swing*
 * between the rate and the finishing place, this splits the *rate* between
 * winning and how much you won by.
 *
 * A result on its own is three values, and in a two-team game that is the whole
 * evening, one match, so the rate could only ever read 1, 0.5 or 0. A 14-13
 * and a 14-0 paid identically, which is the maximum this file can pay, for a
 * game that was a coin flip. The scoreline is the only thing left that knows
 * the difference.
 *
 * Half and half, so **winning still pays on its own**. That is the property
 * worth protecting: on goals alone a settled winner of a 14-13 moves less than
 * half a display point and reads `+0`, which is the same unreadable answer the
 * man-of-the-match bonus shipped with. Holding half the rate on the result puts
 * a floor under a win that no scoreline can take away, and leaves the other half
 * to say whether it was a squeak or a rout.
 */
const RESULT_WEIGHT = 0.5;

/**
 * Goals credited to both sides before taking the share of them.
 *
 * Without it a 1-0 and a 5-0 are the same scoreline, both "all of the goals",
 * and 0-0 is 0/0. With one apiece a 1-0 is two thirds and a 5-0 is six sevenths,
 * which is the shape this wants: the first goal of margin is worth far more than
 * the fifth.
 *
 * That is also the answer to the objection this used to carry, that paying for
 * the margin pays for running the score up on a squad that is a man down. It
 * still pays something, but going from 5-0 to 9-0 is worth a twentieth of what
 * going from 0-0 to 1-0 is, so there is nothing there for anybody to chase.
 *
 * One rather than a bigger number because the group plays both a single long
 * match into the teens and a card of ten-minute matches that finish 1-0. A share
 * is the only currency those two have in common. A goal of margin is nothing in
 * a 14-13 and is the entire game in a 1-0, and it reads correctly as both.
 */
const GOAL_SMOOTHING = 1;

/**
 * What being voted man of the match is worth, in Elo.
 *
 * Half of winning your evening, and **exactly one point of the displayed 0–100**,
 * which is the floor rather than a preference. `toDisplayMovement` rounds to
 * whole display points, so anything under 5 Elo is a bonus the screen can never
 * show: at `K_FACTOR / 8` the winner and their teammates both read `+4` off
 * deltas that genuinely differed, and the one thing the group asks of this
 * number is that the person who won it can see they won it.
 *
 * Below the football on purpose, and by half. Somebody voted best on the pitch
 * every single week gains about as much from the votes as from consistently
 * beating a stacked field. It is a correction the scoreboard cannot make alone,
 * not a second ladder running alongside the first.
 *
 * **Flat, not scaled by the provisional K.** That doubles a newcomer's football
 * and leaves their vote alone, which is the right way round: the provisional
 * multiplier exists because the ladder does not yet know what they are worth,
 * and a room full of people who watched them play is not less sure of its
 * answer for their being new.
 *
 * Derived from `K_FACTOR` rather than written as a number, because the two only
 * mean anything against each other. Left as a constant it would silently become
 * a different proportion of the football every time the football was retuned,
 * which is exactly what happened when it was, and how it went invisible.
 */
export const MOTM_BONUS_ELO = K_FACTOR / 4;

/** Rated games before the provisional period ends. */
export const PROVISIONAL_GAMES = 5;

/**
 * The public 0–100. Clamped, unlike the stored value: a player past the ceiling
 * still gains Elo and the balancer still tells them apart, they just read 100.
 */
export const toDisplayRating = (elo: number): number =>
	Math.max(0, Math.min(100, Math.round(50 + ((elo - BASE_ELO) / DISPLAY_SPAN) * 50)));

/**
 * The Elo behind a shown 0–100, the inverse of `toDisplayRating` across the
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
 * Everywhere the question is "has the ladder had its say about this player",
 * meaning the all-time ladder and whether that starting point is still an
 * admin's to change, this is the test, not the presence of the field.
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
 * estimate of a real player is evidence about that. The alternative reads a
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
 * What one team took from one match: 1 is everything, 0.5 a draw, 0 nothing.
 *
 * Half the result and half the share of the goals, per `RESULT_WEIGHT`. Both
 * halves are symmetric, so the two sides of a match total exactly 1 and the
 * update stays zero-sum without a normalisation step, which is the same property
 * a win probability has and the reason the two can be subtracted at all.
 *
 * Any draw is exactly 0.5 however it was scored: 0-0 and 3-3 were both shared,
 * and the goals in them say nothing the result did not.
 */
export const getMatchScore = (scoreFor: number, scoreAgainst: number): number => {
	const result = scoreFor > scoreAgainst ? 1 : scoreFor < scoreAgainst ? 0 : 0.5;
	const share = (scoreFor + GOAL_SMOOTHING) / (scoreFor + scoreAgainst + 2 * GOAL_SMOOTHING);

	return RESULT_WEIGHT * result + (1 - RESULT_WEIGHT) * share;
};

/** What a team took from the matches it played, and who it played them against. */
export interface TeamRecord {
	/** Matches actually played. Zero for a team the evening never got to.  */
	played: number;
	/**
	 * What it took from them, by `getMatchScore`. The same currency a win
	 * probability is in, and bounded the same 0 to `played`.
	 */
	score: number;
	/**
	 * One entry per match played, repeats and all.
	 *
	 * A list rather than a set because the expectation has to be weighted by how
	 * often you actually met somebody: a three-team lap is a *double* round
	 * robin, so an evening that stops early can genuinely leave you having faced
	 * the strong team twice and the weak one once.
	 */
	opponents: number[];
}

/**
 * What each team took from the match list.
 *
 * Deliberately a second walk over the same matches `tally` in `standings.ts`
 * walks, rather than a reuse of it: that one is building the table and counts in
 * league points, this one is building a rating and counts in `getMatchScore`.
 * They agree on which matches to ignore, since a match naming a team that no
 * longer exists is left over from a lineup rebuilt after it was scored, and on
 * nothing
 * else. Both read the goals now, and still not for the same thing: the table
 * keeps them as a tiebreak between whole results, this spends them on how much
 * of each match was won.
 */
export const getTeamRecords = (teamCount: number, matches: TournamentMatch[]): TeamRecord[] => {
	const records: TeamRecord[] = Array.from({ length: teamCount }, () => ({ played: 0, score: 0, opponents: [] }));

	for (const match of matches) {
		const [recordA, recordB] = [records[match.teamA], records[match.teamB]];

		if (!recordA || !recordB) continue;

		recordA.played++;
		recordB.played++;
		recordA.opponents.push(match.teamB);
		recordB.opponents.push(match.teamA);

		recordA.score += getMatchScore(match.scoreA, match.scoreB);
		recordB.score += getMatchScore(match.scoreB, match.scoreA);
	}

	return records;
};

/**
 * The share of its matches a team was expected to win, averaged over the
 * opponents it actually faced. Ranges 0 to 1, like the rate it is compared
 * against.
 *
 * Averaged rather than summed, which is what makes it comparable across team
 * counts at all: a sum ranges 0 to `teams - 1` and so pays a three-team evening
 * twice a two-team one for arithmetic reasons rather than footballing ones.
 *
 * Because `P(a beats b) + P(b beats a) === 1`, the expectations total the same
 * as the rates do whenever every team played the same number of matches, which
 * is what keeps the update zero-sum with no normalisation step. When an evening
 * ends early and the counts differ, they don't, and the game mints or burns a
 * fraction of one player's movement. That is left alone rather than corrected:
 * weighting the swing by matches played would fix it by making a team that
 * played more move further, which is the arithmetic-not-football problem again,
 * one level down. The drift is smaller than the provisional-K drift below, which
 * is accepted for the same reason.
 */
export const getExpectedRate = (teamElos: number[], index: number, opponents: number[]): number =>
	opponents.length === 0
		? 0
		: opponents.reduce((total, other) => total + getWinProbability(teamElos[index], teamElos[other]), 0) /
			opponents.length;

/**
 * Competition ranks over a subset of the table, so a team left out of the
 * rating doesn't leave a hole in the places.
 *
 * `positions` comes from the full standings; drop a team that played nothing
 * and what's left can read `[0, 2]`, which `getActualWins` would score against a
 * field of three. Re-ranked, ties intact, so two teams the table could not
 * separate are still level here.
 */
const densifyPositions = (positions: number[]): number[] =>
	positions.map(position => positions.filter(other => other < position).length);

/**
 * Finishing place as a score: first out of four gets 3, last gets 0.
 *
 * This is the ordinal half of the swing, `RATE_WEIGHT`'s remainder, and the
 * only place a finishing position reaches a rating at all.
 *
 * `positions` is 0-indexed and may repeat. Teams that finish level share a
 * position and take the average of the scores their places cover, so a two-way
 * tie for first in a four-team game gives both 2.5 rather than inventing a
 * winner. Which is also the one case where first does *not* out-earn second:
 * there was no first, and the table said so.
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
	/** How much of its matches this player's team won, by `getMatchScore`. */
	rate: number;
	/** The share it was expected to win, off the squads it actually faced. */
	expected: number;
}

/**
 * The rating changes for one game.
 *
 * Every player in a squad moves by the same amount. Nothing tracks minutes
 * played, and a rolling sub contributed to the result as much as anyone.
 *
 * A team that played no matches at all is **not rated**, and its players get no
 * change at all rather than a zero one: an evening that stopped after one
 * scoreline told us nothing about the team that never got on, and a game with
 * nothing to say about somebody must not tick their provisional counter down.
 * They are left out of everybody else's expectation and out of the places, so
 * the rest of the field is rated as the game it actually was. This is the same
 * rule `computeGameRatings` already applies to a game with no scores whatsoever,
 * one team down.
 *
 * Provisional players move further than the rest, which means a game
 * containing one is not exactly zero-sum. The drift is small and it buys new
 * players a fast, honest starting point; the alternative is rescaling everyone
 * else's change to compensate, which is impossible to explain to the person it
 * happens to.
 */
export const getRatingChanges = (
	players: RatingInput[],
	matches: TournamentMatch[],
	positions: number[],
	seedElo: number
): RatingChange[] => {
	const teamCount = positions.length;
	const records = getTeamRecords(teamCount, matches);

	const squadElos: number[][] = Array.from({ length: teamCount }, () => []);
	for (const player of players) squadElos[player.team]?.push(getElo(player.rating, seedElo));

	const teamElos = squadElos.map(getTeamElo);

	// The evening as it was actually played, which is the only field anybody can
	// be rated against.
	const played = records.flatMap((record, team) => (record.played > 0 ? [team] : []));
	const actualWins = getActualWins(densifyPositions(played.map(team => positions[team])));

	const swings = new Map<number, { swing: number; rate: number; expected: number }>(
		played.map((team, place) => {
			const rate = records[team].score / records[team].played;
			const expected = getExpectedRate(teamElos, team, records[team].opponents);

			// Both halves are scaled to the same +/- 0.5, so the weighting is a
			// weighting rather than a unit conversion: a team sweeping an evening
			// it was expected to draw, by a distance, scores +0.5 on the rate,
			// and finishing top of the table scores +0.5 on the places, whether
			// that table has two teams in it or four. In a two-team game the
			// places are the result restated, since one match means whoever won
			// it came first, which leaves the rate as the only half with anything
			// left to say, and what it says is the scoreline.
			const ordinal = played.length > 1 ? (actualWins[place] - (played.length - 1) / 2) / (played.length - 1) : 0;

			return [team, { swing: RATE_WEIGHT * (rate - expected) + (1 - RATE_WEIGHT) * ordinal, rate, expected }];
		})
	);

	return players.flatMap(player => {
		const team = swings.get(player.team);

		if (!team) return [];

		const before = getElo(player.rating, seedElo);
		const delta = kFactor(player.rating) * team.swing;

		return [{ uid: player.uid, before, after: before + delta, delta, rate: team.rate, expected: team.expected }];
	});
};

/**
 * Pay the man-of-the-match bonus out of the game it was won in.
 *
 * The pot is `MOTM_BONUS_ELO` and it is **funded by everybody who played**,
 * winner included, in equal shares. So the group's average rating does not
 * move, which matters more here than anywhere else in this file, because the
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
 * the vote stay separately explicable. The screen shows one movement, but the
 * two halves of it are computed where they belong, and a game whose vote never
 * closed simply never has this called on it.
 *
 * A winner who isn't in `changes`, voted for and then dropped from the lineup
 * by a reshuffle, pays in like everyone else and takes nothing out, which
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
