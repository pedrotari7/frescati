/**
 * One player's career, read out of the rating ledger.
 *
 * The ledger is the only record of who actually *played* — a response says who
 * meant to, and on the day those differ — and every entry already carries what
 * each player took into the game, what they took out and where their team
 * finished. So a player screen is an aggregation, not a new collection: nothing
 * here needs storing, and nothing here can disagree with the ladder, because a
 * replay rewrites the same entries this reads.
 *
 * Deliberately says nothing about how many teams a game had. `positions` maps
 * players to their team's place, and a tie for last is indistinguishable from a
 * smaller field — so a place is shown as a place, never as "2nd of 4".
 *
 * That same tie is why anything about *other* people — who somebody plays with,
 * who they keep losing to — reads `teams` instead. A shared place cannot say
 * which side of it two players were on, and in a two-team draw it says they
 * were all on one.
 */

import type { RatingLedgerEntry } from './types';

/** One game a player actually played, as the ledger recorded it. */
export interface PlayerGame {
	seasonId: string;
	gameId: string;
	kickoff: string;
	kickoffMillis: number;
	/** Their team's 0-indexed finishing place. Shared on a tie. */
	position: number;
	/** Their team finished top, shared firsts included — as the season table counts it. */
	won: boolean;
	/** The group voted them man of the match, shared on a tie. */
	motm: boolean;
	/**
	 * Elo carried in — their own rating, or the seed the game rated them off when
	 * they arrived with none. `null` only on an entry written before the seed was
	 * stored, where what they were rated off is genuinely not recoverable.
	 */
	before: number | null;
	/** Elo carried out. */
	after: number;
	/**
	 * What the game moved them, in Elo — the same number the team sheet showed on
	 * the night, including on a first appearance. Zero only where `before` is
	 * `null` and there is no distance to measure, the same rule the season table
	 * applies.
	 */
	delta: number;
}

export interface PlayerRecord {
	/** Oldest first, which is the order the rating was built in. */
	games: PlayerGame[];
	appearances: number;
	wins: number;
	/** Games the group voted them man of the match. */
	motm: number;
	/** The longest run of consecutive wins. */
	bestRun: number;
	/** Wins at the end of the run — zero unless the last game was one. */
	currentRun: number;
	/**
	 * The highest their rating has ever stood — the high-water mark of the line
	 * the chart draws, which opens on what they took into their first game and
	 * not on what that game left them. Counting only what they carried *out* put
	 * the peak below the visible start of their own graph for anybody whose
	 * first result went badly, which is exactly the career that needs telling
	 * they have come down from somewhere.
	 */
	peak: number | null;
}

/**
 * Every rated game this player appeared in, oldest first.
 *
 * An entry missing them from either `positions` or `after` is skipped rather
 * than half-read: the first is what a ledger entry written before positions
 * existed looks like, and without both there is no way to say what the game did
 * to them.
 */
export const getPlayerGames = (entries: RatingLedgerEntry[], uid: string): PlayerGame[] =>
	entries
		.filter(entry => entry.positions?.[uid] !== undefined && entry.after?.[uid] !== undefined)
		.map(entry => {
			// The rating they were rated off, which for somebody arriving unrated
			// is the seed rather than nothing. `null` only where the entry
			// predates the seed being stored and there is genuinely no answer.
			const before = entry.before?.[uid]?.elo ?? entry.seedElo ?? null;
			const after = entry.after[uid].elo;
			const position = entry.positions[uid];

			return {
				seasonId: entry.seasonId,
				gameId: entry.gameId,
				kickoff: entry.kickoff,
				kickoffMillis: entry.kickoffMillis,
				position,
				won: position === 0,
				// Absent on an entry written before the vote existed, and on one
				// confirmed while its own vote was still open. Neither is a game
				// they lost the vote in, but neither is one they won it in either,
				// so both read as false.
				motm: entry.motm?.includes(uid) ?? false,
				before,
				after,
				delta: before === null ? 0 : after - before,
			};
		})
		// Kickoff order, which is the order the ratings were applied in — and the
		// game id after it, so two games kicking off at once still draw the same
		// way on every device rather than however the query happened to return.
		.sort((a, b) => a.kickoffMillis - b.kickoffMillis || (a.gameId < b.gameId ? -1 : 1));

export const getPlayerRecord = (entries: RatingLedgerEntry[], uid: string): PlayerRecord => {
	const games = getPlayerGames(entries, uid);

	let bestRun = 0;
	let currentRun = 0;

	for (const game of games) {
		currentRun = game.won ? currentRun + 1 : 0;
		bestRun = Math.max(bestRun, currentRun);
	}

	// Read off the series the chart draws rather than from the games alone, so
	// the number under the graph can't contradict the graph. Empty for exactly
	// the player who has never played, since the opening only exists in front of
	// a first game.
	const trend = getRatingTrend(games);

	return {
		games,
		appearances: games.length,
		wins: games.filter(game => game.won).length,
		motm: games.filter(game => game.motm).length,
		bestRun,
		currentRun,
		peak: trend.length === 0 ? null : Math.max(...trend),
	};
};

/**
 * One other player, as every game the two of them shared recalls it.
 *
 * Counted from `teams` rather than `positions`, and that is the whole
 * difficulty: a finishing place is shared on a tie, so two players level on 0
 * may have been side by side or on the two teams that drew — and in a two-team
 * game that ends level, everybody looks like a teammate. Only the team map can
 * tell "with" from "against", which is why it exists.
 */
export interface PlayerLink {
	uid: string;
	/** Every game the two both played, whichever side they were on. */
	shared: number;
	/** Games the two were on the same team. */
	together: number;
	/** Of those, games their team finished top — `won`, as everything else counts it. */
	wonTogether: number;
	/** Games the two were on opposing teams. */
	against: number;
	/** Of those, games this player's team finished above theirs. */
	beat: number;
	/** Of those, games the two teams finished level. A draw belongs to neither. */
	drewWith: number;
	/** Of those, games their team finished above this player's. */
	lostTo: number;
}

const emptyLink = (uid: string): PlayerLink => ({
	uid,
	shared: 0,
	together: 0,
	wonTogether: 0,
	against: 0,
	beat: 0,
	drewWith: 0,
	lostTo: 0,
});

/**
 * Everybody this player has shared a rated game with, most games first.
 *
 * Entries with no `teams` map are skipped rather than guessed at — that is what
 * every entry written before the map existed looks like, and there is no
 * honest way to read one, since the thing missing is the only thing that
 * separates a teammate from an opponent. `backfill-ledger-teams` is the repair;
 * until it has run, a career screen simply counts fewer games here than in the
 * record above it, which is the failure worth having.
 *
 * Ordered by games shared and then by uid, so it draws the same way on every
 * device. Names are not in here to sort by — a caller with the profiles can
 * re-sort, and this stays readable from the ledger alone.
 */
export const getPlayerLinks = (entries: RatingLedgerEntry[], uid: string): PlayerLink[] => {
	const links = new Map<string, PlayerLink>();

	for (const entry of entries) {
		const teams = entry.teams;
		const team = teams?.[uid];
		const position = entry.positions?.[uid];

		if (!teams || team === undefined || position === undefined) continue;

		for (const [other, theirTeam] of Object.entries(teams)) {
			const theirPosition = entry.positions?.[other];

			if (other === uid || theirPosition === undefined) continue;

			const link = links.get(other) ?? emptyLink(other);

			link.shared++;

			if (theirTeam === team) {
				link.together++;
				if (position === 0) link.wonTogether++;
			} else {
				link.against++;
				if (position < theirPosition) link.beat++;
				else if (position === theirPosition) link.drewWith++;
				else link.lostTo++;
			}

			links.set(other, link);
		}
	}

	return [...links.values()].sort((a, b) => b.shared - a.shared || (a.uid < b.uid ? -1 : 1));
};

/**
 * The two links worth saying out loud, or `null` where nothing clears
 * `minimum`.
 *
 * A threshold rather than a raw maximum because one game together is a 100%
 * partnership, and a screen that crowns a different best friend every week is
 * one nobody believes twice.
 */
export interface PlayerChemistry {
	/** The partnership that wins most — by rate, so a regular can't win on volume. */
	bestWith: PlayerLink | null;
	/**
	 * The opponent with the better of it, and only when they genuinely have:
	 * somebody this player is level with or ahead of is not a nemesis, and
	 * "worst" against a group they beat every week would be an invented enemy.
	 */
	nemesis: PlayerLink | null;
}

/** Wins minus losses. A level finish is neither, so it counts for nothing. */
const headToHead = (link: PlayerLink): number => link.beat - link.lostTo;

export const getPlayerChemistry = (links: PlayerLink[], minimum: number): PlayerChemistry => {
	// Rate first, then the bigger sample, then the uid — three tiers, because the
	// first two tie constantly in a group of a dozen and the order has to be the
	// same on every device.
	const partners = links
		.filter(link => link.together >= minimum)
		.sort(
			(a, b) =>
				b.wonTogether / b.together - a.wonTogether / a.together ||
				b.together - a.together ||
				(a.uid < b.uid ? -1 : 1)
		);

	const opponents = links
		.filter(link => link.against >= minimum && headToHead(link) < 0)
		.sort((a, b) => headToHead(a) - headToHead(b) || b.against - a.against || (a.uid < b.uid ? -1 : 1));

	return { bestWith: partners[0] ?? null, nemesis: opponents[0] ?? null };
};

/**
 * The rating as it stood after each game, with the rating they started on in
 * front of it.
 *
 * That leading point is what makes the first game visible as a movement rather
 * than as the flat start of the line. Somebody who arrived unrated gets one too,
 * at the seed the game rated them off — except on an entry written before that
 * seed was stored, whose line has nowhere to start but where the game left them.
 */
export const getRatingTrend = (games: PlayerGame[]): number[] => {
	if (games.length === 0) return [];

	const opening = games[0].before;

	return [...(opening === null ? [] : [opening]), ...games.map(game => game.after)];
};
