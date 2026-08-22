/**
 * What the new rating formula would have done to every game already played.
 *
 * A measurement rather than a feature. `getRatingChanges` stopped reading a
 * finishing place and started reading how much of its evening a team actually
 * won, and equalising a three-team game with a two-team one had to move one of
 * them — there is no K that leaves both where they were. So the question this
 * answers is the only one worth answering before deploying it: across the real
 * ledger, how far does an ordinary evening move somebody, and is it still a
 * distance a group can catch each other up over.
 *
 * Worth keeping after that decision for the two occasions it comes back — after
 * the replay, to check the ladder actually landed where this said it would, and
 * whenever K is retuned again.
 *
 * **It writes nothing.** Every rating here is computed in memory and thrown
 * away; the replay that actually applies this is `replayRatingsFrom`, run once
 * after deploying. Safe to point at the live project, which is the point — a
 * seeded scenario cannot tell you what a real Tuesday looks like.
 *
 * Each game is recomputed against the state the ledger says it was *originally*
 * rated from — `before` per player, `seedElo` for whoever arrived unrated —
 * rather than against today's profiles. That is deliberately not what a replay
 * does: a replay carries each game's output into the next, so the second game's
 * inputs would already have moved. Rating every game off its recorded inputs
 * measures the formula on its own, with the compounding held still, which is the
 * thing being decided here. The consequence to accept is that the numbers below
 * are one game's movement each, never a season's drift.
 *
 * K is swept rather than fixed because the whole delta is linear in it —
 * `PROVISIONAL_K_FACTOR` is 2K and `MOTM_BONUS_ELO` is K/8, so scaling one
 * scales all three together and a single pass can price every candidate.
 *
 * Read "as rated" as the old formula only while that is still true: once
 * `replayRatingsFrom` has been, the ledger holds the new numbers and that column
 * becomes a comparison with itself — which is the check that the replay landed.
 *
 * Usage:
 *   pnpm --filter backend rate-replay-report
 *   pnpm --filter backend rate-replay-report 15 20 25 30
 *
 * Against the local emulator instead of the real project:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pnpm --filter backend rate-replay-report
 *
 * Credentials, in order of preference:
 *   1. `gcloud auth application-default login` (no key file on disk)
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */

import type { RatingLedgerEntry, Season, TournamentMatch, TournamentTeams } from '../../shared/types';
import { applyMotmBonus, fromDisplayRating, getRatingChanges, isProvisional, BASE_ELO } from '../../shared/rating';
import type { RatingInput } from '../../shared/rating';
import { getPositions, getStandings } from '../../shared/standings';
import { selectPlayedMatches } from '../../shared/tournament';
import { counted } from '../../shared/format';
import { runScript, UsageError } from './lib/script';
import type { ScriptContext } from './lib/script';

/**
 * The K the code currently ships, which is what `getRatingChanges` will use
 * below. Every other candidate is that pass scaled — see the header.
 */
const SHIPPED_K = 20;

/**
 * Elo per point of the displayed 0-100.
 *
 * Read off the mapping rather than written down, because `DISPLAY_SPAN` is
 * private and a second copy of 250 in a script is a copy that outlives the
 * decision it was made from. The whole report is in display points: Elo is what
 * the ladder stores, and four of *these* is what the group would notice.
 */
const ELO_PER_POINT = fromDisplayRating(51) - fromDisplayRating(50);

/** The band a movement has to land in to be worth a week of catching up. */
const BAND = 4;

const DEFAULT_KS = [15, 20, 25, 30];

interface GameRow {
	kickoff: string;
	teams: number;
	matches: number;
	/**
	 * The biggest movement among players who were already settled, in Elo, and
	 * `null` for a game where nobody was — the opening weeks of a season, where
	 * everybody on the pitch is still provisional.
	 *
	 * `null` rather than 0, because those games have nothing to say about the K a
	 * settled player feels and scoring them as no movement drags every median
	 * below what the group would actually see. It is the same distinction the app
	 * draws everywhere else: no answer is not a quiet no.
	 */
	settled: number | null;
	/** The biggest movement of anybody at all, provisional players included. */
	anybody: number;
	/** What the game actually paid at the time, biggest settled movement. */
	asRated: number | null;
	/** The same, over everybody — the only old-versus-new a young ledger has. */
	asRatedAnybody: number;
}

const points = (elo: number) => elo / ELO_PER_POINT;

const median = (values: number[]): number => {
	if (values.length === 0) return 0;

	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const percentile = (values: number[], fraction: number): number => {
	if (values.length === 0) return 0;

	const sorted = [...values].sort((a, b) => a - b);

	return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
};

const pad = (text: string, width: number) => text.padEnd(width);
const num = (value: number, width: number) => value.toFixed(1).padStart(width);

/**
 * The biggest movement in one game, in Elo, over whichever players the caller
 * cares about. The biggest rather than the average because the question is what
 * an evening can do to somebody, not what it does on average to everybody —
 * half a squad is always on the other side of the same number.
 *
 * `null` for nobody at all, which is a game this measurement cannot speak for
 * rather than a game that moved nothing.
 */
const biggest = (deltas: number[]): number | null =>
	deltas.length === 0 ? null : deltas.reduce((most, delta) => Math.max(most, Math.abs(delta)), 0);

export const main = async ({ db, args }: ScriptContext) => {
	const candidates = args.length > 0 ? args.map(Number) : DEFAULT_KS;

	if (candidates.some(k => !Number.isFinite(k) || k <= 0)) {
		throw new UsageError('Every argument must be a K to price, e.g.  rate-replay-report 40 50 60');
	}

	const ledger = await db.collection('ratingLedger').orderBy('kickoffMillis').get();

	console.log(`${counted(ledger.size, 'rated game')} in the ledger.\n`);

	if (ledger.empty) return;

	const seasons = new Map<string, Season | undefined>();
	const rows: GameRow[] = [];
	const skipped: string[] = [];

	for (const doc of ledger.docs) {
		const entry = doc.data() as RatingLedgerEntry;
		const label = `${entry.kickoff.slice(0, 10)}  ${entry.gameId}`;
		const gamePath = `seasons/${entry.seasonId}/games/${entry.gameId}`;

		if (!seasons.has(entry.seasonId)) {
			const snapshot = await db.doc(`seasons/${entry.seasonId}`).get();
			seasons.set(entry.seasonId, snapshot.exists ? (snapshot.data() as Season) : undefined);
		}

		const season = seasons.get(entry.seasonId);
		const [teamsSnap, matchesSnap] = await Promise.all([
			db.doc(`${gamePath}/tournament/teams`).get(),
			db.collection(`${gamePath}/matches`).get(),
		]);

		// The same three things `computeGameRatings` needs, and the same reason
		// each is fatal rather than guessable: without the lineup there is no
		// squad to average, and without the slot there is no way to know which
		// orders the rotation ever reached.
		if (!season || !teamsSnap.exists) {
			skipped.push(`${label} — ${season ? 'no team sheet' : 'season is gone'}`);
			continue;
		}

		const lineup = teamsSnap.data() as TournamentTeams;
		const matches = selectPlayedMatches(
			lineup.teams.length,
			lineup.settings.matchMinutes,
			season.slot.durationMinutes,
			matchesSnap.docs.map(match => match.data() as TournamentMatch)
		);

		if (matches.length === 0) {
			skipped.push(`${label} — no scores survive the fixture check`);
			continue;
		}

		const unrated = Object.values(entry.before).some(rating => rating === null);

		if (unrated && entry.seedElo === undefined) {
			skipped.push(`${label} — rated somebody unrated with no seed recorded, run backfill-ledger-seed`);
			continue;
		}

		const players: RatingInput[] = lineup.teams.flatMap(team =>
			team.uids.map(uid => ({ uid, rating: entry.before[uid] ?? undefined, team: team.index }))
		);

		const positions = getPositions(getStandings(lineup.teams.length, matches));
		const changes = applyMotmBonus(
			getRatingChanges(players, matches, positions, entry.seedElo ?? BASE_ELO),
			entry.motm ?? []
		);

		// A team sheet with nobody on it, against scorelines that survived the
		// fixture check. Nothing to price, and averaging an empty squad is where
		// a NaN would enter the report and quietly poison every median after it.
		const anybody = biggest(changes.map(change => change.delta));

		if (anybody === null) {
			skipped.push(`${label} — scores but nobody on the team sheet`);
			continue;
		}

		const settledUids = new Set(
			changes.map(change => change.uid).filter(uid => !isProvisional(entry.before[uid] ?? undefined))
		);

		/** What the game paid at the time — read off the entry, never recomputed. */
		const paid = (uids: string[]) =>
			biggest(
				uids.map(uid => {
					const before = entry.before[uid]?.elo ?? entry.seedElo ?? BASE_ELO;

					return (entry.after[uid]?.elo ?? before) - before;
				})
			);

		rows.push({
			kickoff: entry.kickoff,
			teams: lineup.teams.length,
			matches: matches.length,
			settled: biggest(changes.filter(change => settledUids.has(change.uid)).map(change => change.delta)),
			anybody,
			asRated: paid([...settledUids]),
			// Never null: `anybody` above already refused an empty team sheet.
			asRatedAnybody: paid(changes.map(change => change.uid)) ?? 0,
		});
	}

	if (rows.length === 0) {
		console.error('Nothing could be recomputed.');
		for (const line of skipped) console.error(`  ${line}`);
		return;
	}

	report(rows, candidates);

	if (skipped.length > 0) {
		console.log(`\n${counted(skipped.length, 'game')} could not be recomputed:`);
		for (const line of skipped) console.log(`  ${line}`);
	}
};

/** The settled movement in display points, for the games that had one. */
const settledPoints = (rows: GameRow[], k: number): number[] =>
	rows.flatMap(row => (row.settled === null ? [] : [points(row.settled) * (k / SHIPPED_K)]));

const report = (rows: GameRow[], candidates: number[]) => {
	const span = `${rows[0].kickoff.slice(0, 10)} to ${rows[rows.length - 1].kickoff.slice(0, 10)}`;
	const rated = rows.filter(row => row.settled !== null);

	console.log(`${counted(rows.length, 'game')} recomputed, ${span}.\n`);

	const line = (name: string, values: number[]) => {
		const within = values.filter(value => value <= BAND).length / values.length;

		console.log(
			`  ${pad(name, 10)}${num(median(values), 8)}${num(percentile(values, 0.9), 8)}${num(Math.max(...values), 8)}` +
				`${`${Math.round(within * 100)}%`.padStart(12)}`
		);
	};

	const heading = () =>
		console.log(
			`  ${pad('', 10)}${'median'.padStart(8)}${'p90'.padStart(8)}${'max'.padStart(8)}${'within ±4'.padStart(12)}`
		);

	if (rated.length > 0) {
		console.log(
			`Biggest movement in an evening, in display points, for a player already settled\n` +
				`(${counted(rated.length, 'game')} of ${rows.length} had one on the pitch):\n`
		);
		heading();

		line(
			'as rated',
			rated.map(row => points(row.asRated ?? 0))
		);
		for (const k of candidates) line(`K=${k}`, settledPoints(rated, k));

		console.log('\nAnd for somebody still provisional, who swings twice as far by design:\n');
	} else {
		// A young ladder rather than a broken read: everybody in the whole
		// history is still inside their provisional games. There is no settled
		// median to print off nobody, but the sweep still answers the question —
		// a provisional swing is exactly twice a settled one at the same K, so
		// halve any row below to see what the same evening pays once it counts.
		console.log(
			`Nobody in any of these games was past their provisional games, so there is no settled\n` +
				`movement to price. Every row below is a provisional swing — twice what the same\n` +
				`evening will pay once the group has settled:\n`
		);
	}

	heading();
	line(
		'as rated',
		rows.map(row => points(row.asRatedAnybody))
	);
	for (const k of candidates)
		line(
			`K=${k}`,
			rows.map(row => points(row.anybody) * (k / SHIPPED_K))
		);

	// The complaint this whole change came from: three teams paid twice what two
	// teams did, for no footballing reason. If it worked, these rows now agree.
	const grouped = rated.length > 0 ? rated : rows;
	const movement = (row: GameRow) => (rated.length > 0 ? (row.settled ?? 0) : row.anybody);
	const asPaid = (row: GameRow) => (rated.length > 0 ? (row.asRated ?? 0) : row.asRatedAnybody);

	console.log(
		`\nBy team count — median biggest ${rated.length > 0 ? 'settled' : 'provisional'} movement, in display points:\n`
	);
	console.log(
		`  ${pad('teams', 8)}${'games'.padStart(7)}${'as rated'.padStart(10)}${candidates.map(k => `K=${k}`.padStart(8)).join('')}`
	);

	for (const teams of [...new Set(grouped.map(row => row.teams))].sort((a, b) => a - b)) {
		const group = grouped.filter(row => row.teams === teams);

		console.log(
			`  ${pad(String(teams), 8)}${String(group.length).padStart(7)}` +
				`${num(median(group.map(row => points(asPaid(row)))), 10)}` +
				candidates.map(k => num(median(group.map(row => points(movement(row)) * (k / SHIPPED_K))), 8)).join('')
		);
	}
};

// Only when run as a command, so a test can import `main` and drive it against
// the emulators without `runScript` reaching for real credentials.
if (require.main === module) runScript(main);
