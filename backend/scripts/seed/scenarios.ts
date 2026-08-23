/**
 * What a seeded database looks like.
 *
 * A scenario is a declaration, not a script: it says which seasons exist, who
 * is in them and which games are unusual, and `write.ts` turns that into the
 * documents the app would hold if those things had actually happened. The point
 * of the split is that adding a case you want to look at, a game nobody
 * answered, a season with one member, is an entry in a list here, not a new
 * pile of Firestore writes.
 *
 * Everything is positioned relative to *today*, so a seed is as useful in six
 * months as it is now. Weeks are the unit because the slot repeats weekly.
 */

import type {
	BalanceSettings,
	GameStatus,
	KitKind,
	SeasonSlot,
	SeasonStatus,
	Venue,
	Weekday,
} from '../../../shared/types';

/**
 * One thing the group owns, in the season's kit register.
 *
 * The holder is declared as a *state* rather than a name, because who happens
 * to have the ball is arbitrary and what a screen shows is not: `out` is the
 * warning on the next game, `silent` is the amber "nobody has confirmed"
 * version of it, and `left` is the stranded-kit callout, which otherwise can
 * only be reached by removing somebody from a squad by hand. The seeder
 * resolves each against the answers it has already generated for the next game.
 */
export interface KitPlan {
	name: string;
	kind: KitKind;
	/** Against the next upcoming game: has said in, said out, hasn't answered, or has left the squad. */
	holder: 'in' | 'out' | 'silent' | 'left';
}

/** A game that differs from the ordinary run of the season. */
export interface GamePin {
	status?: GameStatus;
	cancelledReason?: string;
	note?: string;
	/** Force the confirmed headcount instead of rolling one from the band. */
	playing?: number;
	/**
	 * `full`: everyone has an opinion; `partial`: some members still silent;
	 * `none`: nobody has answered at all.
	 */
	responses?: 'full' | 'partial' | 'none';
	/**
	 * `confirmed`: scored and rated; `scored`: scores in but nobody has hit
	 * Confirm; `unplayed`: no scores.
	 */
	outcome?: 'unplayed' | 'scored' | 'confirmed';
	minPlayers?: number;
	oneOff?: boolean;
	venue?: Venue;
	reshuffleCount?: number;
	balance?: Partial<BalanceSettings>;
	/**
	 * Cast keys who tapped the bell on this game. Nobody by default, which is
	 * the honest starting point, following is off until somebody turns it on,
	 * but a game with none is also a game where the admin card that lists them
	 * has nothing to say, so at least one pin should carry a few.
	 */
	watcherKeys?: string[];
	/**
	 * Where the man-of-the-match vote has got to. Only meaningful on a
	 * `confirmed` game. The vote opens when the scores are confirmed.
	 *
	 * `decided` is the default and what every past game looks like: counted,
	 * with the winner's bonus already in the ratings. `open` is the state
	 * somebody would actually be looking at: votes cast, nothing counted, no
	 * bonus applied yet, and needs at least one pin carrying it or the voting
	 * screen can only ever be seen by confirming a game by hand.
	 */
	motm?: 'open' | 'decided';
}

export interface SeasonPlan {
	id: string;
	/** Left out to derive one from the start date, e.g. `Spring 2026`. */
	name?: string;
	status: SeasonStatus;
	venue: Venue;
	slot: SeasonSlot;
	minPlayers: number;
	responseDeadlineHours: number;
	reminderHours: number[];
	balance?: BalanceSettings;
	/** Cast keys. */
	memberKeys: string[];
	adminKeys: string[];
	/** Cast keys who aren't members but put their hand up for this season. */
	extraKeys: string[];
	/** Weeks either side of today. Negative is the past. */
	startWeeks: number;
	endWeeks: number;
	/** Confirmed headcount band for an ordinary game, inclusive. */
	turnout: [number, number];
	/** `empty` leaves every past game unplayed, a season with no ladder yet. */
	history: 'played' | 'empty';
	/** What the group owns. Left out for a season that keeps no register. */
	kit?: KitPlan[];
	/** Keyed by offset from the next upcoming game: `0` is next, `-1` is last. */
	pins?: Record<number, GamePin>;
}

export interface Scenario {
	summary: string;
	/** Cast keys granted the global `admin` claim. */
	appAdminKeys: string[];
	/**
	 * Cast keys given an account but no profile and no season, what a stranger
	 * who just signed in with Google actually looks like.
	 */
	newcomerKeys: string[];
	seasons: SeasonPlan[];
}

const STOCKHOLM = 'Europe/Stockholm';

const FRESCATI: Venue = {
	name: 'Frescati IP',
	address: 'Frescativägen 12, Stockholm',
	mapsUrl: 'https://maps.google.com/?q=Frescati+IP',
};

const KRISTINEBERG: Venue = {
	name: 'Kristinebergs BP',
	address: 'Nordenflychtsvägen 60, Stockholm',
	mapsUrl: 'https://maps.google.com/?q=Kristinebergs+bollplan',
};

const ZINKENSDAMM: Venue = {
	name: 'Zinkensdamms IP',
	address: 'Ringvägen 12, Stockholm',
	mapsUrl: 'https://maps.google.com/?q=Zinkensdamms+IP',
};

const GUBBANGEN: Venue = { name: 'Gubbängens IP', address: 'Gubbängstorget 117, Stockholm' };

const tuesdayEvening: SeasonSlot = { weekday: 2, time: '19:00', durationMinutes: 90, timezone: STOCKHOLM };

/**
 * A weekly slot placed so the next game is always a few days off.
 *
 * Everything else in here is positioned relative to *today*, which is what
 * keeps a seed as useful in six months as it is now, and a hardcoded weekday
 * was the one thing that was not. It meant that whenever the seed was written
 * on the slot's own day, the next game was already inside its response
 * deadline: `getGameLifecycle` calls it `locked`, `RespondControl` draws In and
 * Out disabled, and the one journey this whole app exists for could not be
 * walked. Real behaviour, correctly implemented, on a fixture that had quietly
 * arranged to be looked at during the only hours it does not apply.
 *
 * Three days, not one, because the deadline is a season's own setting and the
 * longest here is twelve hours. It is the *soonest* game that matters: the
 * series repeats weekly from this weekday, so the next one is always this far
 * ahead however long the season has been running.
 */
const daysAhead = (days: number, time: string, durationMinutes: number): SeasonSlot => ({
	weekday: ((new Date().getDay() + days) % 7) as Weekday,
	time,
	durationMinutes,
	timezone: STOCKHOLM,
});

/**
 * The slot for a season being played right now. Archived seasons keep a real
 * weekday, nothing answers a game that finished months ago, and so does the
 * Sunday offshoot, which is named after the day it plays on.
 */
const currentEvening = (): SeasonSlot => daysAhead(3, '19:00', 90);
const thursdayEvening: SeasonSlot = { weekday: 4, time: '20:00', durationMinutes: 90, timezone: STOCKHOLM };
const sundayMorning: SeasonSlot = { weekday: 0, time: '10:00', durationMinutes: 75, timezone: STOCKHOLM };

/**
 * The everyday scenario: a group with a couple of years behind it, one season
 * running now, one about to start, and a Sunday offshoot that shares half its
 * players. Enough history for the ladder to mean something, and enough oddity
 * in the fixtures to reach every state a game screen can be in.
 */
const full: Scenario = {
	summary: 'Three seasons, a full ladder, and a fixture list covering every game state',
	appAdminKeys: ['pedro'],
	newcomerKeys: ['zoe'],
	seasons: [
		{
			id: 'season-previous',
			status: 'archived',
			venue: FRESCATI,
			slot: tuesdayEvening,
			minPlayers: 10,
			responseDeadlineHours: 3,
			reminderHours: [48, 6],
			memberKeys: [
				'pedro',
				'anna',
				'mateo',
				'johan',
				'yara',
				'viktor',
				'sofia',
				'dimitri',
				'elena',
				'omar',
				'lukas',
				'nina',
				'tobias',
				'priya',
			],
			adminKeys: ['pedro', 'anna'],
			extraKeys: ['marcus', 'hanna'],
			startWeeks: -30,
			endWeeks: -16,
			turnout: [10, 14],
			history: 'played',
			pins: {
				[-20]: { status: 'cancelled', cancelledReason: 'Pitch frozen solid' },
			},
		},
		{
			id: 'season-current',
			status: 'active',
			venue: FRESCATI,
			slot: currentEvening(),
			minPlayers: 10,
			responseDeadlineHours: 3,
			reminderHours: [48, 6],
			balance: { randomness: 0.3, repeatPenalty: 0.45, repeatLookback: 4, matchMinutes: 5 },
			memberKeys: [
				'pedro',
				'anna',
				'mateo',
				'johan',
				'yara',
				'viktor',
				'sofia',
				'dimitri',
				'elena',
				'omar',
				'lukas',
				'nina',
				'tobias',
				'priya',
				'marcus',
				'hanna',
				'rafael',
				'ingrid',
			],
			adminKeys: ['pedro', 'anna'],
			extraKeys: ['kwame', 'linnea', 'samir', 'greta', 'andrei', 'maja'],
			startWeeks: -12,
			endWeeks: 10,
			turnout: [12, 17],
			history: 'played',
			// Every state the register can be in, on the season somebody
			// actually opens: a ball that is covered by one of two, vests that
			// nobody is bringing, a pump whose holder has gone quiet, and one
			// item stranded with somebody who has left the squad.
			kit: [
				{ name: 'Match ball', kind: 'ball', holder: 'in' },
				{ name: 'Spare ball', kind: 'ball', holder: 'left' },
				{ name: 'Blue vests', kind: 'vests', holder: 'out' },
				{ name: 'Pump', kind: 'other', holder: 'silent' },
			],
			pins: {
				// Played, scored, and waiting on somebody to hit Confirm, the
				// state the auto-confirm sweep exists for.
				[-1]: { outcome: 'scored', note: 'Floodlight on pitch B was out, played the far end' },
				// Confirmed late, so its man-of-the-match vote is still running.
				// The one game in a seeded database where the voting screen has
				// anything to do, everything older has been counted, and the
				// game after this one hasn't been confirmed at all.
				[-2]: { motm: 'open' },
				// The game everyone is actually looking at.
				[0]: {
					responses: 'partial',
					playing: 15,
					reshuffleCount: 1,
					// Three members and an extra, picked without regard to how any
					// of them answered, following is not answering, and the admin
					// card that lists them should look like its own thing rather
					// than a slice of the roster.
					watcherKeys: ['anna', 'tobias', 'kwame', 'ingrid'],
				},
				// Short of players, so somebody is watching for a late yes.
				[1]: {
					responses: 'partial',
					playing: 7,
					note: 'Half the squad is away for the long weekend',
					watcherKeys: ['pedro'],
				},
				[2]: { status: 'cancelled', cancelledReason: 'Pitch double-booked with a youth tournament' },
				[3]: {
					oneOff: true,
					venue: ZINKENSDAMM,
					note: 'One-off at Zinkensdamm while Frescati is resurfaced',
					responses: 'partial',
					playing: 11,
					minPlayers: 8,
				},
				// Deliberately left alone: the empty state a game gets the day it
				// is generated.
				[4]: { responses: 'none' },
				[5]: { responses: 'none' },
				// The top of the two-team band, which nothing else here reaches:
				// twelve is two squads of six playing 5v5 with a sub each and one
				// match for the whole slot, where thirteen would be three teams
				// and a six-match rotation. The band rolls a twelve some runs and
				// not others, and this is a shape worth being able to open on
				// purpose rather than when the dice agree.
				[6]: { responses: 'partial', playing: 12 },
			},
		},
		{
			id: 'season-sunday',
			name: 'Sunday Kickabout',
			status: 'active',
			venue: KRISTINEBERG,
			slot: sundayMorning,
			minPlayers: 8,
			responseDeadlineHours: 12,
			reminderHours: [24],
			balance: { randomness: 0.5, repeatPenalty: 0.2, repeatLookback: 3, matchMinutes: 5 },
			memberKeys: ['yara', 'sofia', 'elena', 'nina', 'priya', 'hanna', 'linnea', 'greta', 'maja', 'astrid'],
			adminKeys: ['yara'],
			extraKeys: ['claudia', 'wilma'],
			startWeeks: -6,
			endWeeks: 12,
			turnout: [8, 11],
			history: 'played',
			// The amber middle state on its own, with nothing else going wrong:
			// one ball, and the person holding it hasn't answered yet.
			kit: [{ name: 'Ball', kind: 'ball', holder: 'silent' }],
			pins: {
				[0]: { responses: 'partial', playing: 9 },
				[1]: { responses: 'none' },
			},
		},
		{
			id: 'season-draft',
			status: 'draft',
			venue: GUBBANGEN,
			slot: thursdayEvening,
			minPlayers: 12,
			responseDeadlineHours: 6,
			reminderHours: [72, 24],
			memberKeys: ['pedro', 'anna', 'rafael', 'omar', 'noah'],
			adminKeys: ['pedro'],
			extraKeys: [],
			startWeeks: 8,
			endWeeks: 24,
			turnout: [0, 0],
			// A draft season has not generated its calendar yet. That is the
			// button an admin is about to press.
			history: 'empty',
		},
	],
};

/**
 * A big turnout every week. Four teams, deep squads and a long ladder: what
 * the optimizer and the tournament screens look like under load.
 */
const big: Scenario = {
	summary: 'One large season: 26 members, four-team games, a season of history',
	appAdminKeys: ['pedro'],
	newcomerKeys: ['zoe'],
	seasons: [
		{
			id: 'season-big',
			status: 'active',
			venue: FRESCATI,
			slot: currentEvening(),
			minPlayers: 16,
			responseDeadlineHours: 4,
			reminderHours: [72, 24, 4],
			balance: { randomness: 0.2, repeatPenalty: 0.6, repeatLookback: 6, matchMinutes: 5 },
			memberKeys: [
				'pedro',
				'anna',
				'mateo',
				'johan',
				'yara',
				'viktor',
				'sofia',
				'dimitri',
				'elena',
				'omar',
				'lukas',
				'nina',
				'tobias',
				'priya',
				'marcus',
				'hanna',
				'rafael',
				'ingrid',
				'kwame',
				'linnea',
				'samir',
				'greta',
				'andrei',
				'maja',
				'felipe',
				'astrid',
			],
			adminKeys: ['pedro', 'rafael'],
			extraKeys: ['tariq', 'wilma', 'noah', 'claudia', 'erik'],
			startWeeks: -20,
			endWeeks: 12,
			turnout: [18, 24],
			history: 'played',
			// Nothing wrong here on purpose. A register that is doing its job
			// draws nothing at all on the next-game card, and that is worth
			// being able to see too.
			kit: [
				{ name: 'Match ball', kind: 'ball', holder: 'in' },
				{ name: 'Bibs', kind: 'vests', holder: 'in' },
			],
			pins: {
				[-1]: { outcome: 'scored' },
				[0]: { responses: 'partial', playing: 21 },
				[1]: { responses: 'none' },
			},
		},
	],
};

/**
 * Day one. One season, nobody has answered anything, nobody has a rating,
 * every empty state in the app at once, which is the hardest thing to reach on
 * a database that has been used.
 */
const fresh: Scenario = {
	summary: 'A brand-new group: one season, no history, no ratings, every empty state',
	appAdminKeys: ['pedro'],
	newcomerKeys: ['zoe', 'erik'],
	seasons: [
		{
			id: 'season-new',
			status: 'active',
			venue: KRISTINEBERG,
			slot: currentEvening(),
			minPlayers: 10,
			responseDeadlineHours: 3,
			reminderHours: [48, 6],
			memberKeys: ['pedro', 'anna', 'mateo', 'johan', 'yara', 'viktor', 'sofia', 'dimitri', 'elena', 'omar'],
			adminKeys: ['pedro'],
			extraKeys: ['nina'],
			startWeeks: -1,
			endWeeks: 14,
			turnout: [0, 0],
			history: 'empty',
			pins: {
				[0]: { responses: 'partial', playing: 4 },
			},
		},
	],
};

export const SCENARIOS: Record<string, Scenario> = { full, big, fresh };

export const DEFAULT_SCENARIO = 'full';
