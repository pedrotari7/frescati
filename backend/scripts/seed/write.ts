/**
 * Turning a scenario into a database.
 *
 * The guiding rule: nothing is invented that the app could work out for itself.
 * Counts come from `tallyResponses`, lineups from `pickTeams`, tables from
 * `getStandings`, ratings from `getRatingChanges` — the same functions the Cloud
 * Functions call. A seeded database is therefore one the app could genuinely
 * have arrived at, which is what makes testing against it worth anything. Make
 * up a rating column by hand and the first replay you trigger disagrees with it.
 *
 * The one thing that *is* invented is the scoreline, from each player's hidden
 * `strength`. Everything downstream of a result is then derived from it.
 */

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { WriteBatch } from 'firebase-admin/firestore';
import type {
	AppUser,
	BalanceSettings,
	ClientInfo,
	Game,
	GameResponse,
	KitItem,
	MotmVote,
	NotificationPrefs,
	PlayerRating,
	PushToken,
	RatingLedgerEntry,
	Season,
	TournamentMatch,
	TournamentMotm,
	TournamentResult,
	TournamentTeams,
} from '../../../shared/types';
import { DEFAULT_BALANCE_SETTINGS, DEFAULT_NOTIFICATION_PREFS } from '../../../shared/types';
import { addCivilDays, addHours, getZonedParts } from '../../../shared/datetime';
import { generateGameDates } from '../../../shared/schedule';
import { getMinPlayers, isConfirmed, tallyResponses } from '../../../shared/game';
import { getSeed, pickTeams } from '../../../shared/optimizer';
import type { OptimizerPlayer } from '../../../shared/optimizer';
import { getFixtures, getSquadSizes, getTeamCount } from '../../../shared/tournament';
import { applyMotmBonus, applyRatingChange, getRatingChanges, getSeedElo } from '../../../shared/rating';
import type { RatingInput } from '../../../shared/rating';
import { MOTM_VOTING_HOURS, tallyMotmVotes } from '../../../shared/motm';
import { getPositions, getStandings } from '../../../shared/standings';
import { CAST, avatarPath, castMember, emailFor, googleSubFor, uidFor } from './cast';
import type { CastMember } from './cast';
import type { GamePin, KitPlan, Scenario, SeasonPlan } from './scenarios';

/** Firestore caps a batch at 500 writes; leave room for the odd extra. */
const BATCH_LIMIT = 400;

/** Seconds `settle` watches for before it will believe the triggers are done. */
const MINIMUM_WATCH = 12;

/**
 * Mulberry32, the same generator the optimizer uses.
 *
 * Seeded from the scenario rather than the clock, so who is a member, who
 * answered and how the fixtures are shaped come out the same on every run and a
 * layout you saw once can be looked at twice. The lineups and scorelines do
 * move, because those hang off the game's document id and that carries the run
 * id — the alternative being that a rebuild triggered from the app produces
 * different teams from the ones the seed wrote, which is exactly the kind of
 * quiet disagreement a fixture is supposed to be free of.
 */
const createRng = (seed: number): (() => number) => {
	let state = seed >>> 0;

	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const hashSeed = (text: string): number => {
	let hash = 2166136261;

	for (const character of text) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}

	return hash >>> 0;
};

const shuffled = <T>(items: T[], rng: () => number): T[] => {
	const copy = [...items];

	for (let index = copy.length - 1; index > 0; index--) {
		const other = Math.floor(rng() * (index + 1));
		[copy[index], copy[other]] = [copy[other], copy[index]];
	}

	return copy;
};

const between = (rng: () => number, low: number, high: number): number => low + Math.floor(rng() * (high - low + 1));

/** Knuth's method. Goals in a short match are close enough to Poisson. */
const poisson = (mean: number, rng: () => number): number => {
	const limit = Math.exp(-mean);
	let count = 0;
	let product = rng();

	while (product > limit && count < 12) {
		count++;
		product *= rng();
	}

	return count;
};

const db = () => getFirestore();

/**
 * Where the app is served from, so an avatar written into `frontend/public`
 * resolves. Firebase Auth insists on an absolute URL, and the app copies the
 * auth record's `photoURL` onto the profile on every sign-in — so a relative
 * path would be rejected here and an absolute one is what has to be stored.
 */
let appOrigin = 'http://localhost:3000';

const photoFor = (member: CastMember): string | null => {
	const path = avatarPath(member);

	return path === null ? null : `${appOrigin}${path}`;
};

/** Real strings, so the admin screen's parsing is exercised rather than faked. */
const USER_AGENTS = {
	iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
	android:
		'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
	mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
	windows:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68',
};

/**
 * How somebody reaches the app: what they open it on, what they have registered
 * for push, and which kinds they've switched off.
 *
 * A table rather than a roll off the RNG, because the admin notification screen
 * exists to explain *why* a push doesn't arrive, and every one of those reasons
 * has to be sitting in a seeded database or the screen can't be looked at. So
 * the list covers each of them once — the iPhone nobody ever added to the home
 * screen, the account with two devices, the person who muted everything, the
 * profile written before any of this was recorded — rather than thirty
 * variations on "works fine".
 */
interface DeviceProfile {
	/** Absent means they haven't signed in since the app started recording this. */
	client?: { platform: ClientInfo['platform']; standaloneHoursAgo?: number };
	/** One entry per registered device, newest last. */
	devices?: { agent: string; hoursAgo: number }[];
	prefs?: Partial<NotificationPrefs>;
}

const DEVICE_PROFILES: DeviceProfile[] = [
	// The happy path: installed on a phone, registered, everything on.
	{ client: { platform: 'ios', standaloneHoursAgo: 6 }, devices: [{ agent: USER_AGENTS.iphone, hoursAgo: 900 }] },
	{
		client: { platform: 'android', standaloneHoursAgo: 30 },
		devices: [{ agent: USER_AGENTS.android, hoursAgo: 1400 }],
	},

	// The one this screen is really for. On iPhone, push simply does not work
	// until the app is on the home screen — and nothing else in the database
	// says so.
	{ client: { platform: 'ios' } },

	// Installed, but never turned notifications on. Worth telling apart from
	// the row above: this one only needs a nudge, not an explanation.
	{ client: { platform: 'ios', standaloneHoursAgo: 50 } },

	// No device and no email either — the only way left to be genuinely
	// unreachable now that the fallback catches everybody else with nothing
	// registered. Without this the admin screen's "Nothing gets through"
	// section is empty in every seeded run.
	{ client: { platform: 'desktop' }, prefs: { emailFallback: false } },

	// Registered, then muted every kind. The devices are there and the pushes
	// still go nowhere.
	{
		client: { platform: 'desktop' },
		devices: [{ agent: USER_AGENTS.mac, hoursAgo: 200 }],
		prefs: { reminders: false, gameChanges: false },
	},

	// Half muted — the reminders are off, the cancellations still land.
	{
		client: { platform: 'android', standaloneHoursAgo: 90 },
		devices: [{ agent: USER_AGENTS.android, hoursAgo: 700 }],
		prefs: { reminders: false },
	},

	// Phone and laptop both registered.
	{
		client: { platform: 'ios', standaloneHoursAgo: 2 },
		devices: [
			{ agent: USER_AGENTS.windows, hoursAgo: 2000 },
			{ agent: USER_AGENTS.iphone, hoursAgo: 120 },
		],
	},

	// Signed in on a laptop and never on a phone. Fine — push works from a
	// browser tab everywhere except iOS.
	{ client: { platform: 'desktop' }, devices: [{ agent: USER_AGENTS.mac, hoursAgo: 40 }] },

	// A profile from before the app recorded any of this. Reads as "never
	// seen", which is the truth — not as "not installed".
	{},
];

/**
 * How long ago each player last had the app on screen, spread so the activity
 * screen has all of its sections to show rather than one full one and the rest
 * empty. Picked by key, like everything else here, so two runs on the same day
 * produce the same database.
 *
 * Weighted the way a real group is — most of them were here since the last
 * game, one or two have drifted off entirely. That last pair is the whole point
 * of the screen, so a seeded database without them makes it untestable.
 */
const VISIT_HOURS_AGO = [1, 5, 20, 26, 50, 71, 9 * 24, 20 * 24, 45 * 24, 120 * 24];

/**
 * The device documents for one person, picked by their key so two seed runs on
 * the same day produce the same database.
 */
const deviceProfileFor = (member: CastMember, now: string) => {
	const profile = DEVICE_PROFILES[hashSeed(`devices:${member.key}`) % DEVICE_PROFILES.length];

	const client: ClientInfo | undefined = profile.client && {
		platform: profile.client.platform,
		...(profile.client.standaloneHoursAgo === undefined
			? {}
			: { lastStandaloneAt: addHours(now, -profile.client.standaloneHoursAgo) }),
	};

	const tokens: PushToken[] = (profile.devices ?? []).map((device, index) => ({
		// The real thing is an FCM registration token and the document id, which
		// is what makes re-registering the same device overwrite rather than
		// pile up. Only the shape matters here.
		token: `seed-${member.key}-${index}`,
		createdAt: addHours(now, -device.hoursAgo),
		userAgent: device.agent,
	}));

	return { client, tokens, prefs: { ...DEFAULT_NOTIFICATION_PREFS, ...profile.prefs } };
};

const commitAll = async (writes: ((batch: WriteBatch) => void)[]): Promise<void> => {
	for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
		const batch = db().batch();
		for (const write of writes.slice(start, start + BATCH_LIMIT)) write(batch);
		await batch.commit();
	}
};

/* ------------------------------------------------------------------ people */

/**
 * Give everyone an account the browser can sign into.
 *
 * `importUsers` rather than `createUser` because only the import form takes
 * `providerData`, and the Google link is the whole point: the emulator matches
 * an incoming sign-in on the provider's `sub`, so a link imported here is what
 * makes the browser land on the *seeded* uid rather than minting a fresh one
 * and leaving every seeded document orphaned.
 */
const importCast = async (scenario: Scenario): Promise<void> => {
	const auth = getAuth();

	const result = await auth.importUsers(
		CAST.map(member => ({
			uid: uidFor(member.key),
			email: emailFor(member.key),
			emailVerified: true,
			displayName: member.displayName,
			photoURL: photoFor(member) ?? undefined,
			providerData: [
				{
					uid: googleSubFor(member.key),
					providerId: 'google.com',
					email: emailFor(member.key),
					displayName: member.displayName,
					photoURL: photoFor(member) ?? undefined,
				},
			],
		}))
	);

	if (result.failureCount > 0) {
		throw new Error(`Could not import ${result.failureCount} accounts: ${JSON.stringify(result.errors)}`);
	}

	for (const key of scenario.appAdminKeys) await auth.setCustomUserClaims(uidFor(key), { admin: true });
};

/* ----------------------------------------------------------------- seasons */

const LABELS = ['Winter', 'Spring', 'Summer', 'Autumn'] as const;

/** `Spring 2026`, from the month a season starts in. */
const seasonLabel = (startDate: string): string => {
	const [year, month] = startDate.split('-').map(Number);

	if (month === 12) return `${LABELS[0]} ${year + 1}`;

	return `${LABELS[Math.floor(month / 3)]} ${year}`;
};

/** Today as a civil date in the season's own timezone, not the machine's. */
const todayIn = (timezone: string): string => {
	const { year, month, day } = getZonedParts(new Date().toISOString(), timezone);

	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const buildSeason = (plan: SeasonPlan, createdBy: string, runId: string): Season => {
	const today = todayIn(plan.slot.timezone);
	const startDate = addCivilDays(today, plan.startWeeks * 7);
	const endDate = addCivilDays(today, plan.endWeeks * 7);

	return {
		// Scoped to the run, so the cascade set off by wiping the *previous*
		// seed goes looking for paths this one will never write to. Stable ids
		// would read better in a URL and were what this did first — until a
		// recursive delete arrived forty seconds late and quietly emptied a
		// freshly seeded database.
		id: `${plan.id}-${runId}`,
		name: plan.name ?? seasonLabel(startDate),
		status: plan.status,
		startDate,
		endDate,
		venue: plan.venue,
		slot: plan.slot,
		minPlayers: plan.minPlayers,
		responseDeadlineHours: plan.responseDeadlineHours,
		reminderHours: plan.reminderHours,
		balance: plan.balance ?? DEFAULT_BALANCE_SETTINGS,
		memberUids: plan.memberKeys.map(uidFor),
		adminUids: plan.adminKeys.map(uidFor),
		createdAt: addHours(`${startDate}T12:00:00.000Z`, -24 * 14),
		createdBy,
	};
};

/* --------------------------------------------------------------------- kit */

/**
 * The season's kit register.
 *
 * A scenario declares each item's holder as a *state* — in, out, silent, gone —
 * and this resolves it against the answers already generated for the next
 * upcoming game. That way round because the person is arbitrary and the state
 * is not: naming Pedro in the scenario would produce whatever coverage the
 * shuffle happened to give him that run, and the screen worth looking at is the
 * one where the vests are with somebody who is out.
 *
 * `left` deliberately writes a holder who is *not* on `memberUids`, which the
 * security rules would refuse — the seeder holds an Admin SDK handle and is not
 * bound by them. That is the right call here: a stranded item is a real state,
 * reached by a roster moving underneath a register rather than by a bad write,
 * and it is the only way to see that screen without editing Firestore by hand.
 */
const pickKitHolder = (item: KitPlan, plan: SeasonPlan, season: Season, next: PlannedGame | undefined): string => {
	if (item.holder === 'left') return uidFor(plan.extraKeys[0] ?? CAST[CAST.length - 1].key);

	const answers = new Map((next?.responses ?? []).map(response => [response.uid, response.status]));

	// Roster order rather than shuffled: two seed runs of the same scenario
	// should hand the ball to the same person.
	const holder = season.memberUids.find(uid => {
		if (item.holder === 'silent') return !answers.has(uid);

		return answers.get(uid) === item.holder;
	});

	// A season with no games yet, or one where everybody answered the same way,
	// has nobody to fill the requested state. Somebody still has the ball.
	return holder ?? season.memberUids[0];
};

const buildKit = (plan: SeasonPlan, season: Season, planned: PlannedGame[]): (KitItem & { seasonId: string })[] => {
	const next = planned.find(entry => entry.season.id === season.id && entry.offset === 0);
	const owner = uidFor(plan.adminKeys[0] ?? plan.memberKeys[0]);

	return (plan.kit ?? []).map((item, index) => ({
		id: `kit-${index}`,
		seasonId: season.id,
		name: item.name,
		kind: item.kind,
		holderUid: pickKitHolder(item, plan, season, next),
		// The admin who set the register up. Every handover after this one is
		// signed by whoever made it, which is what the rules pin.
		updatedBy: owner,
		updatedAt: season.createdAt,
	}));
};

/* ------------------------------------------------------------------- games */

interface PlannedGame {
	game: Game;
	plan: SeasonPlan;
	season: Season;
	pin: GamePin;
	/** Where it sits relative to the next upcoming game. */
	offset: number;
	responses: GameResponse[];
	/** Uids following this game. Presence is the whole subscription. */
	watchers: string[];
}

/**
 * How a game was answered.
 *
 * `playing` is the target confirmed headcount, and the members who say yes are
 * drawn per game rather than per season, so the same fourteen people don't turn
 * up every single week. Members who neither said in nor out get **no document
 * at all** — that is the third state, and a seeder that wrote a placeholder for
 * them would quietly hide every bug in how the app handles silence.
 */
const buildResponses = (
	plan: SeasonPlan,
	season: Season,
	game: Game,
	pin: GamePin,
	mode: 'full' | 'partial' | 'none',
	rng: () => number
): GameResponse[] => {
	if (mode === 'none') return [];

	const target = pin.playing ?? between(rng, plan.turnout[0], plan.turnout[1]);
	const memberUids = shuffled(season.memberUids, rng);

	// Extras top up a thin game rather than swelling a healthy one — which is
	// what they are for, and it keeps confirmed extras worth looking at.
	const extraTarget = Math.min(plan.extraKeys.length, Math.max(0, target - memberUids.length));
	const membersIn = Math.min(memberUids.length, target - extraTarget);

	const responses: GameResponse[] = [];
	const respondedAt = (rank: number): string => addHours(game.kickoff, -(120 - rank * 3));

	memberUids.forEach((uid, rank) => {
		const isIn = rank < membersIn;

		// On a partially answered game the tail of the squad simply hasn't
		// opened the app yet.
		if (mode === 'partial' && !isIn && rng() < 0.55) return;

		responses.push({
			uid,
			status: isIn ? 'in' : 'out',
			role: 'member',
			respondedAt: respondedAt(rank),
			updatedAt: respondedAt(rank),
			...(!isIn && rng() < 0.25 ? { note: 'Away this week' } : {}),
		});
	});

	shuffled(plan.extraKeys.map(uidFor), rng).forEach((uid, rank) => {
		const isIn = rank < extraTarget + 2;

		if (mode === 'partial' && rng() < 0.4) return;

		// Confirmation is an admin decision, so an extra sits in one of three
		// states: waved in, turned down, or still waiting to hear. All three
		// have to exist or the roster's pending styling is never exercised.
		const confirmOverride = rank < extraTarget ? true : rng() < 0.3 ? false : undefined;

		responses.push({
			uid,
			status: isIn ? 'in' : 'out',
			role: 'extra',
			...(confirmOverride === undefined ? {} : { confirmOverride }),
			respondedAt: respondedAt(memberUids.length + rank),
			updatedAt: respondedAt(memberUids.length + rank),
			...(rank === 0 && isIn ? { note: 'Friend of Anna, played a few times' } : {}),
		});
	});

	return responses;
};

const defaultResponseMode = (offset: number, plan: SeasonPlan): 'full' | 'partial' | 'none' => {
	if (offset < 0) return plan.history === 'played' ? 'full' : 'none';
	if (offset === 0) return 'partial';
	if (offset <= 2) return 'partial';

	return 'none';
};

const buildGames = (plan: SeasonPlan, season: Season, createdBy: string): PlannedGame[] => {
	if (plan.history === 'empty' && plan.status === 'draft') return [];

	const generated = generateGameDates(season.slot, season.startDate, season.endDate);
	const now = new Date().toISOString();

	// The next game that has not kicked off yet is the origin every pin is
	// counted from, so a scenario stays meaningful whenever it is seeded.
	const nextIndex = generated.findIndex(candidate => candidate.kickoff > now);
	const origin = nextIndex === -1 ? generated.length : nextIndex;

	return generated.map((generatedGame, index) => {
		const offset = index - origin;
		const pin = plan.pins?.[offset] ?? {};
		const rng = createRng(hashSeed(`${plan.id}:${index}`));

		const game: Game = {
			// Under the season's run-scoped id, so this is unique per run too —
			// which matters for `ratingLedger`, keyed on the game id alone.
			id: `${season.id}-g${String(index + 1).padStart(2, '0')}`,
			seasonId: season.id,
			kickoff: generatedGame.kickoff,
			kickoffMillis: Date.parse(generatedGame.kickoff),
			endsAt: generatedGame.endsAt,
			venue: pin.venue ?? season.venue,
			status: pin.status ?? 'scheduled',
			isOneOff: pin.oneOff ?? false,
			// Overwritten from the responses below; the shape has to exist first.
			counts: tallyResponses([]),
			atRisk: true,
			createdAt: season.createdAt,
			createdBy,
			...(pin.note ? { note: pin.note } : {}),
			...(pin.cancelledReason ? { cancelledReason: pin.cancelledReason } : {}),
			...(pin.minPlayers ? { minPlayers: pin.minPlayers } : {}),
			...(pin.balance ? { balance: pin.balance } : {}),
			...(pin.reshuffleCount ? { reshuffleCount: pin.reshuffleCount } : {}),
		};

		const mode = game.status === 'cancelled' ? 'none' : (pin.responses ?? defaultResponseMode(offset, plan));
		const responses = buildResponses(plan, season, game, pin, mode, rng);

		const counts = tallyResponses(responses);

		return {
			game: { ...game, counts, atRisk: counts.playing < getMinPlayers(game, season) },
			plan,
			season,
			pin,
			offset,
			responses,
			// Following is deliberately unrelated to answering — you might be
			// watching precisely because you haven't decided yet — so these are
			// named outright rather than drawn from whoever said In.
			watchers: (pin.watcherKeys ?? []).map(uidFor),
		};
	});
};

/* ------------------------------------------------- playing the games out */

interface PlayedGame {
	teams: TournamentTeams;
	matches: TournamentMatch[];
	result?: TournamentResult;
	ledger?: RatingLedgerEntry;
	/** Cast on a confirmed game, whether or not they have been counted yet. */
	motmVotes: MotmVote[];
	/** Present once the vote has been counted. */
	motm?: TournamentMotm;
	/** Set while the vote is still running, exactly as the function would leave it. */
	motmVotingUntilMillis?: number;
}

const resolveSettings = (season: Season, game: Game): BalanceSettings => ({
	...DEFAULT_BALANCE_SETTINGS,
	...season.balance,
	...game.balance,
});

const strengthOf = (uid: string): number => castMember(uid.replace(/^dev-/, '')).strength;

/**
 * A scoreline, from what the two squads are actually made of.
 *
 * Deliberately driven by hidden strength rather than by rating: that is the
 * direction the real thing runs in — ability produces results, results move
 * ratings — and it means a seeded ladder ends up roughly sorted by ability
 * without ever being told to be, which is the best evidence available that the
 * rating maths is doing something sensible.
 */
const playMatch = (squadA: string[], squadB: string[], rng: () => number): [number, number] => {
	const mean = (squad: string[]) =>
		squad.length === 0 ? 0.5 : squad.reduce((total, uid) => total + strengthOf(uid), 0) / squad.length;

	// Squad averages over five or six people cluster tightly, so the gap between
	// two sides is small in absolute terms and has to be amplified to say
	// anything. Too low and every game is a coin flip, the ratings random-walk,
	// and the seeded ladder ends up in no relation to who can actually play.
	const edge = (mean(squadA) - mean(squadB)) * 8;
	const base = 2.2;

	return [poisson(Math.max(0.3, base + edge), rng), poisson(Math.max(0.3, base - edge), rng)];
};

/**
 * Who the squad voted man of the match.
 *
 * Weighted by the same hidden `strength` the scorelines come from, sharpened so
 * the standout usually — not always — takes it. Which is the same trick the
 * scorelines use, and for the same reason: a seeded ladder that ends up roughly
 * sorted by ability without ever being told to be is the best evidence
 * available that the maths behind it works.
 *
 * Turnout is deliberately short of everybody. A vote where all fourteen people
 * answer is not one this app will ever see, and a screen that only ever renders
 * a full turnout hides what a thin one looks like.
 */
const runMotmVote = (uids: string[], kickoff: string, rng: () => number): MotmVote[] => {
	const weights = uids.map(uid => strengthOf(uid) ** 4);
	const total = weights.reduce((sum, weight) => sum + weight, 0);

	const pick = (): string => {
		let target = rng() * total;

		for (const [index, weight] of weights.entries()) {
			target -= weight;
			if (target <= 0) return uids[index];
		}

		return uids[uids.length - 1];
	};

	return uids
		.filter(() => rng() < 0.65)
		.map((uid, rank) => ({
			uid,
			votedFor: pick(),
			// Spread over the evening and the morning after, which is when a
			// notification sent at confirmation actually gets answered.
			votedAt: addHours(kickoff, 3 + rank * 1.5),
		}));
};

/**
 * Play one game out: pick the teams, roll the scores, and — if it was
 * confirmed — work out what it did to everyone's rating.
 *
 * `ratings` is the live ladder as it stood *going into* this game, and is
 * mutated on the way out. Games are played in kickoff order across every
 * season for exactly that reason: ratings are global, so a Sunday result has to
 * be sitting in the ladder before the Tuesday that follows it is rated, or the
 * ledger a replay walks would not reproduce itself.
 */
const playGame = (
	planned: PlannedGame,
	ratings: Map<string, PlayerRating>,
	history: string[][][]
): PlayedGame | null => {
	const { game, season, pin, offset } = planned;

	if (game.status === 'cancelled') return null;

	const pool = planned.responses.filter(response => response.status === 'in' && isConfirmed(response));
	const teamCount = getTeamCount(pool.length);

	if (teamCount === 0) return null;

	const settings = resolveSettings(season, game);
	const seedElo = getSeedElo(
		season.memberUids.map(uid => ratings.get(uid)?.elo).filter((elo): elo is number => typeof elo === 'number')
	);

	const players: OptimizerPlayer[] = pool.map(response => ({
		uid: response.uid,
		elo: ratings.get(response.uid)?.elo ?? seedElo,
	}));

	const seed = getSeed(game.id, game.reshuffleCount ?? 0);

	const teams = pickTeams({
		players,
		squadSizes: getSquadSizes(pool.length, teamCount),
		seed,
		settings,
		history: history.slice(0, settings.repeatLookback),
	});

	const lineup: TournamentTeams = {
		teams,
		elos: Object.fromEntries(players.map(player => [player.uid, player.elo])),
		seed,
		settings,
		// Aligned with the game document by `alignGenerations` once everything
		// has landed; a placeholder here would read as a stale lineup.
		generation: 1,
		builtAt: addHours(game.kickoff, -2),
	};

	const outcome = pin.outcome ?? (offset < 0 && planned.plan.history === 'played' ? 'confirmed' : 'unplayed');

	if (outcome === 'unplayed') return { teams: lineup, matches: [], motmVotes: [] };

	const rng = createRng(seed ^ 0x5f3759df);
	const scoredBy = pool[Math.floor(rng() * pool.length)]?.uid ?? season.adminUids[0];

	const fixtures = getFixtures(teamCount, settings.matchMinutes, season.slot.durationMinutes);

	const matches: TournamentMatch[] = fixtures.map(fixture => {
		const [scoreA, scoreB] = playMatch(teams[fixture.teamA].uids, teams[fixture.teamB].uids, rng);

		return {
			order: fixture.order,
			teamA: fixture.teamA,
			teamB: fixture.teamB,
			scoreA,
			scoreB,
			updatedBy: scoredBy,
			updatedAt: addHours(game.kickoff, 1 + fixture.order * 0.2),
		};
	});

	if (outcome === 'scored') return { teams: lineup, matches, motmVotes: [] };

	const finalisedAt = addHours(game.kickoff, 2.5);
	const standings = getStandings(teamCount, matches);
	const positions = getPositions(standings);

	const inputs: RatingInput[] = teams.flatMap(team =>
		team.uids.map(uid => ({ uid, rating: ratings.get(uid), team: team.index }))
	);

	// Confirming is what opens the vote, so every confirmed game has one. An
	// `open` pin is a game somebody confirmed late: the votes are in, nothing
	// has counted them, and the bonus is therefore *not* in these ratings —
	// which is exactly the state `closeMotmVoting` will find and replay.
	const motmVotes = runMotmVote(
		teams.flatMap(team => team.uids),
		game.kickoff,
		rng
	);
	const counted = (pin.motm ?? 'decided') === 'decided';
	const tally = tallyMotmVotes(motmVotes);

	const changes = applyMotmBonus(getRatingChanges(inputs, positions, seedElo), counted ? tally.winners : []);

	const before = Object.fromEntries(changes.map(change => [change.uid, ratings.get(change.uid) ?? null]));
	const after = Object.fromEntries(
		changes.map(change => [change.uid, applyRatingChange(ratings.get(change.uid), change, finalisedAt)])
	);

	for (const [uid, rating] of Object.entries(after)) ratings.set(uid, rating);

	return {
		teams: lineup,
		matches,
		motmVotes,
		...(counted
			? { motm: { winners: tally.winners, counts: tally.counts, decidedAt: addHours(finalisedAt, 48) } }
			: // Still running, so the window is ahead of now rather than behind the
				// game — the state a game confirmed a moment ago is in.
				{ motmVotingUntilMillis: Date.now() + MOTM_VOTING_HOURS * 3_600_000 }),
		result: {
			standings,
			changes,
			finalisedAt,
			// Every so often nobody got round to it and the sweep did it — the
			// screen says so, and `null` is how it knows.
			finalisedBy: rng() < 0.25 ? null : season.adminUids[0],
		},
		ledger: {
			seasonId: season.id,
			gameId: game.id,
			kickoff: game.kickoff,
			kickoffMillis: game.kickoffMillis,
			finalisedAt,
			before,
			after,
			positions: Object.fromEntries(inputs.map(input => [input.uid, positions[input.team]])),
			// The team itself as well as where it came, because a shared place
			// cannot say which side of it two players were on — see
			// `RatingLedgerEntry.teams`. Without this the seeded ladder looks
			// right and every profile's teammates panel is empty.
			teams: Object.fromEntries(inputs.map(input => [input.uid, input.team])),
			// Only where somebody arrived unrated, exactly as `commitGameRatings`
			// decides it — a seeded first appearance has to move a season table by
			// the same amount the real thing would.
			...(Object.values(before).some(rating => rating === null) ? { seedElo } : {}),
			// Left off entirely while the vote is open, the same way
			// `commitGameRatings` leaves it off — "nobody won it" and "it hasn't
			// been counted" must not look the same on a career screen.
			...(counted && tally.winners.length > 0 ? { motm: tally.winners } : {}),
		},
	};
};

/* ------------------------------------------------------------------ output */

export interface DevUser {
	uid: string;
	email: string;
	displayName: string;
	photoURL: string | null;
	/** What the browser sends to sign in as this person. */
	sub: string;
	/** One line of "who am I signing in as", for the switcher. */
	hint: string;
}

const describe = (member: CastMember, scenario: Scenario, seasons: Season[]): string => {
	const uid = uidFor(member.key);
	const parts: string[] = [];

	if (scenario.appAdminKeys.includes(member.key)) parts.push('App admin');

	const adminOf = seasons.filter(season => season.adminUids.includes(uid));
	const memberOf = seasons.filter(season => season.memberUids.includes(uid) && !adminOf.includes(season));

	if (adminOf.length > 0) parts.push(`Admin of ${adminOf.map(season => season.name).join(', ')}`);
	if (memberOf.length > 0) parts.push(`Member of ${memberOf.map(season => season.name).join(', ')}`);

	if (parts.length === 0) parts.push('Signed in, but in no season — an extra');

	return parts.join(' · ');
};

/* ------------------------------------------------------------------- seed */

export interface SeedSummary {
	seasons: number;
	games: number;
	responses: number;
	kit: number;
	confirmedGames: number;
	ratedPlayers: number;
	devUsers: DevUser[];
	/** Keyed by game path, for `settle` to re-assert. */
	lineups: Map<string, TournamentTeams>;
	/** Resolved, run-scoped — not the ids the scenario declares. */
	seasonIds: string[];
	/**
	 * When each confirmed game was confirmed, keyed by game path. Applied by
	 * `settle` rather than here — see the note on `onMatchWrite` there.
	 */
	finalisedAt: Map<string, string>;
}

/**
 * Wipe both emulators.
 *
 * The REST endpoints rather than a recursive delete: they are instant, they
 * take the Auth accounts with them, and they exist only on the emulator — so a
 * seed pointed at anything real fails here rather than half way through.
 *
 * Note what this does *not* do: wait. Deleting a season fires `onSeasonDeleted`,
 * whose recursive delete can still be walking the tree minutes later, and there
 * is no way to observe from out here that the queue has drained — a trigger
 * that has been queued but not yet dispatched is indistinguishable from one
 * that has finished. That is why every seeded season carries a run id: the
 * cascade goes looking for paths this run will never write to.
 */
export const wipeEmulators = async (projectId: string): Promise<void> => {
	const firestore = process.env.FIRESTORE_EMULATOR_HOST;
	const auth = process.env.FIREBASE_AUTH_EMULATOR_HOST;

	const responses = await Promise.all([
		fetch(`http://${firestore}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
			method: 'DELETE',
		}),
		fetch(`http://${auth}/emulator/v1/projects/${projectId}/accounts`, {
			method: 'DELETE',
			headers: { Authorization: 'Bearer owner' },
		}),
	]);

	for (const response of responses) {
		if (!response.ok) throw new Error(`Could not clear an emulator: ${response.status} ${await response.text()}`);
	}
};

export const seedScenario = async (scenario: Scenario, origin: string, runId: string): Promise<SeedSummary> => {
	appOrigin = origin;

	await importCast(scenario);

	const creator = uidFor(scenario.appAdminKeys[0] ?? CAST[0].key);
	const seasons = scenario.seasons.map(plan => buildSeason(plan, creator, runId));

	const planned = scenario.seasons.flatMap((plan, index) => buildGames(plan, seasons[index], creator));

	// Ratings are global, so the whole calendar is replayed as one sequence.
	// This is the same ordering `replayRatingsFrom` walks, and for the same
	// reason: a game has to be rated against the ladder the games before it
	// left behind.
	const inKickoffOrder = [...planned].sort((a, b) => a.game.kickoffMillis - b.game.kickoffMillis);

	const ratings = new Map<string, PlayerRating>();
	const historyBySeason = new Map<string, string[][][]>();
	const games = new Map<string, PlayedGame>();

	for (const entry of inKickoffOrder) {
		const history = historyBySeason.get(entry.season.id) ?? [];
		const game = playGame(entry, ratings, history);

		if (!game) continue;

		games.set(entry.game.id, game);
		historyBySeason.set(entry.season.id, [game.teams.teams.map(team => team.uids), ...history]);
	}

	const now = new Date().toISOString();

	const profiles: ((batch: WriteBatch) => void)[] = CAST.filter(
		member => !scenario.newcomerKeys.includes(member.key)
	).flatMap(member => {
		const uid = uidFor(member.key);
		const rating = ratings.get(uid);
		const isAppAdmin = scenario.appAdminKeys.includes(member.key);
		const { client, tokens, prefs } = deviceProfileFor(member, now);

		const profile: AppUser = {
			uid,
			displayName: member.displayName,
			photoURL: photoFor(member),
			createdAt: addHours(now, -24 * 400),
			// Staggered, but from the key rather than the clock — two seed runs
			// on the same day should produce the same database.
			lastSeenAt: addHours(now, -VISIT_HOURS_AGO[hashSeed(`visit:${member.key}`) % VISIT_HOURS_AGO.length]),
			isAppAdmin,
			// The app admin keeps every kind on: they are the only person the
			// new-player notice is sent to, and a seeded database where nobody
			// can receive it makes that path untestable.
			notificationPrefs: isAppAdmin ? DEFAULT_NOTIFICATION_PREFS : prefs,
			...(client ? { client } : {}),
			// Absent until they have played a rated game — the app treats a
			// missing rating as "no rating", never as zero.
			...(rating ? { rating } : {}),
		};

		return [
			(batch: WriteBatch) => batch.set(db().doc(`users/${uid}`), profile),
			// The token is the document id, exactly as `enablePush` writes it.
			...tokens.map(
				token => (batch: WriteBatch) => batch.set(db().doc(`users/${uid}/pushTokens/${token.token}`), token)
			),
		];
	});

	// Built after the games, because a scenario says who holds a piece of kit in
	// terms of how they answered the next one.
	const kit = scenario.seasons.flatMap((plan, index) => buildKit(plan, seasons[index], planned));

	const documents: ((batch: WriteBatch) => void)[] = [
		...profiles,
		...seasons.map(season => (batch: WriteBatch) => {
			const { id: _id, ...data } = season;
			batch.set(db().doc(`seasons/${season.id}`), data);
		}),
		// The document id is the id, exactly as the app writes it — nothing
		// stores a copy of it in the document.
		...kit.map(item => (batch: WriteBatch) => {
			const { id, seasonId, ...data } = item;
			batch.set(db().doc(`seasons/${seasonId}/kit/${id}`), data);
		}),
	];

	for (const entry of planned) {
		const gameRef = db().doc(`seasons/${entry.season.id}/games/${entry.game.id}`);
		const { id: _id, ...gameData } = entry.game;
		const open = games.get(entry.game.id)?.motmVotingUntilMillis;

		// The vote window belongs on the game document, where the security rules
		// and the closing sweep both read it. Written here rather than in
		// `buildGames` because whether there is a vote at all depends on how the
		// game was played, which is worked out afterwards.
		documents.push(batch => batch.set(gameRef, { ...gameData, ...(open ? { motmVotingUntilMillis: open } : {}) }));

		for (const response of entry.responses) {
			documents.push(batch => batch.set(gameRef.collection('responses').doc(response.uid), response));
		}

		// The id is the uid — that is what `getWatcherUids` reads, and what the
		// rules bind the `uid` field to.
		for (const uid of entry.watchers) {
			documents.push(batch =>
				batch.set(gameRef.collection('watchers').doc(uid), { uid, createdAt: entry.game.createdAt })
			);
		}

		const game = games.get(entry.game.id);
		if (!game) continue;

		documents.push(batch => batch.set(gameRef.collection('tournament').doc('teams'), game.teams));

		for (const match of game.matches) {
			documents.push(batch => batch.set(gameRef.collection('matches').doc(String(match.order)), match));
		}

		// The id is the voter, exactly as the rules require — and the votes stay
		// on a decided game too, because counting them is not consuming them.
		for (const vote of game.motmVotes) {
			documents.push(batch => batch.set(gameRef.collection('motmVotes').doc(vote.uid), vote));
		}

		if (game.motm) {
			documents.push(batch => batch.set(gameRef.collection('tournament').doc('motm'), game.motm!));
		} else if (game.motmVotes.length > 0) {
			// The turnout, but only while the vote is open — `closeMotmVote` takes
			// this document with the window, so a decided game must not have one.
			// Written here rather than left to `onMotmVoteWrite` for the reason the
			// counters are: a seed that only looked right once the triggers had
			// caught up is a seed with a race in it.
			documents.push(batch =>
				batch.set(gameRef.collection('tournament').doc('motmVoters'), {
					uids: game.motmVotes.map(vote => vote.uid).sort(),
					updatedAt: entry.game.createdAt,
				})
			);
		}

		if (game.result) {
			const { result, ledger } = game;
			documents.push(batch => batch.set(gameRef.collection('tournament').doc('result'), result));
			documents.push(batch => batch.set(db().doc(`ratingLedger/${entry.game.id}`), ledger!));
			// `resultFinalisedAt` deliberately not written here — `settle` does it.
		}
	}

	await commitAll(documents);

	const devUsers: DevUser[] = CAST.map(member => ({
		uid: uidFor(member.key),
		email: emailFor(member.key),
		displayName: member.displayName,
		photoURL: photoFor(member),
		sub: googleSubFor(member.key),
		hint: scenario.newcomerKeys.includes(member.key)
			? 'Never signed in — no profile, no season'
			: describe(member, scenario, seasons),
	}));

	return {
		seasons: seasons.length,
		games: planned.length,
		responses: planned.reduce((total, entry) => total + entry.responses.length, 0),
		kit: kit.length,
		confirmedGames: [...games.values()].filter(game => game.result).length,
		ratedPlayers: ratings.size,
		devUsers,
		seasonIds: seasons.map(season => season.id),
		finalisedAt: new Map(
			planned
				.filter(entry => games.get(entry.game.id)?.result)
				.map(entry => [
					`seasons/${entry.season.id}/games/${entry.game.id}`,
					games.get(entry.game.id)!.result!.finalisedAt,
				])
		),
		lineups: new Map(
			planned
				.filter(entry => games.has(entry.game.id))
				.map(entry => [`seasons/${entry.season.id}/games/${entry.game.id}`, games.get(entry.game.id)!.teams])
		),
	};
};

/**
 * Have the last word over the Functions emulator.
 *
 * Two storms have to be waited out, and one avoided altogether.
 *
 * The waiting: every one of the hundreds of seeded responses fires
 * `onResponseWrite`, which recounts, bumps `teamsGeneration` and queues a
 * rebuild. Those keep arriving well after the last write lands, and a rebuild
 * that runs afterwards would re-pick the teams for a game whose scores are
 * already in. So wait for the generations to go quiet, write the seeded lineups
 * back over anything that got rebuilt, and bump the generation once more —
 * leaving every rebuild still in flight carrying a stale generation, which is
 * exactly what makes it drop itself.
 *
 * The avoiding: `onMatchWrite` fires a full ladder replay for every score
 * written to an already-confirmed game. Writing `resultFinalisedAt` up front
 * would therefore set off a hundred and eighty overlapping replays against a
 * database still being written, and they interleave into a ladder that is not
 * quite what any single clean replay produces. So the seeder leaves the marker
 * off, and it goes on here — by which point most of the match triggers have run,
 * seen an unconfirmed game, and correctly done nothing.
 *
 * Most, not all: the queue runs deep enough that some arrive after the marker
 * lands and start replaying anyway. Hence the last step — one clean replay,
 * run once everything has gone quiet. It is idempotent and it converges, so it
 * repairs whatever the overlapping ones left behind, and any straggler that
 * fires afterwards computes the same answer and changes nothing.
 *
 * With the Functions emulator switched off there is nothing to wait for, and
 * `waitForTriggers` skips straight to the write.
 */
export const settle = async (
	seasonIds: string[],
	lineups: Map<string, TournamentTeams>,
	finalisedAt: Map<string, string>,
	waitForTriggers: boolean
): Promise<void> => {
	const games = (
		await Promise.all(
			seasonIds.map(seasonId => db().collection(`seasons/${seasonId}/games`).select('teamsGeneration').get())
		)
	).flatMap(snapshot => snapshot.docs);

	if (games.length === 0) return;

	const refs = games.map(doc => doc.ref);

	// Both things the triggers move: the generation a recount bumps, and the
	// ratings a replay rewrites. Watching only the first calls it quiet while
	// the ladder is still being churned.
	const read = async (): Promise<string> => {
		const [games, users] = await Promise.all([db().getAll(...refs), db().collection('users').get()]);

		return [
			...games.map(snapshot => String(snapshot.get('teamsGeneration') ?? 0)),
			...users.docs.map(doc => `${doc.id}:${doc.get('rating')?.elo ?? ''}`),
		].join(',');
	};

	if (waitForTriggers) {
		let previous = await read();
		let quiet = 0;

		// Four still seconds, and never fewer than `MINIMUM_WATCH` in total. The
		// floor is the important half: the triggers take a moment to get going,
		// so the seconds either side of the last write look exactly as quiet as
		// the far end of the storm — and without it this calls the whole thing
		// over before a single recount has arrived.
		for (let attempt = 0; attempt < 90 && (quiet < 4 || attempt < MINIMUM_WATCH); attempt++) {
			await new Promise(resolve => setTimeout(resolve, 1000));
			const current = await read();

			quiet = current === previous ? quiet + 1 : 0;
			previous = current;
		}
	}

	const snapshots = await db().getAll(...refs);

	await commitAll(
		snapshots.flatMap(snapshot => {
			// Belt and braces: a game that has gone between the two reads is a
			// cascade this run failed to wait out, and crashing on it here would
			// lose an otherwise complete seed.
			if (!snapshot.exists) return [];

			const generation = (snapshot.get('teamsGeneration') ?? 0) + 1;
			const lineup = lineups.get(snapshot.ref.path);
			const confirmed = finalisedAt.get(snapshot.ref.path);

			return [
				(batch: WriteBatch) =>
					batch.update(snapshot.ref, {
						teamsGeneration: generation,
						...(confirmed ? { resultFinalisedAt: confirmed } : {}),
					}),
				// Only where the scenario built one. Creating a document here for
				// a game that has no lineup would leave a half-built team sheet,
				// which is worse than none.
				...(lineup
					? [
							(batch: WriteBatch) =>
								batch.set(snapshot.ref.collection('tournament').doc('teams'), {
									...lineup,
									generation,
								}),
						]
					: []),
			];
		})
	);

	if (!waitForTriggers) return;

	// Imported here rather than at the top: the shared backend helpers build
	// their Firestore handle at module load and would bind to a default app
	// created before this script set the project.
	const { replayRatingsFrom } = await import('../../src/lib/finalise');

	// The line of JSON this prints comes from the functions logger, which has no
	// idea it is being run from a script. Say what it is rather than swallow it.
	console.log('  replaying the ladder once, cleanly, over anything the triggers touched:');

	await replayRatingsFrom(0);
};
