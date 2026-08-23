import type { BalanceSettings, Season, SeasonStatus, Weekday } from '@shared/types';
import { DEFAULT_BALANCE_SETTINGS } from '@shared/types';
import { parseCount } from '@shared/game';

/**
 * The season settings screen's form, and the three questions it has to answer
 * about itself.
 *
 * In `lib/` rather than in the route file, where all of this started: `app/` is
 * deliberately left out of the jest suite, a route is a subscription, a layout
 * and a permission check assembled together, and what is worth asserting about
 * one is that it renders the real thing against real rules, which is an
 * end-to-end test. That reasoning does not extend to a pure function that turns
 * a season into a form and back, which is exactly the sort of thing that breaks
 * quietly and cheaply.
 *
 * Everything is held as the control speaks it: the sliders in whole
 * percentages, the reminder windows as the comma-separated string somebody
 * typed, every number box as typed, and converted back on save.
 */
export interface SeasonForm {
	name: string;
	status: SeasonStatus;
	venueName: string;
	venueAddress: string;
	weekday: Weekday;
	time: string;
	startDate: string;
	endDate: string;
	reminderHours: string;
	/** The sliders, which speak whole percentages and cannot be cleared. */
	randomness: number;
	repeatPenalty: number;
	/*
	 * Everything typed into a number box, held as typed. `Number('')` is `0`, so
	 * coercing on each keystroke made backspacing a field to empty, the
	 * ordinary way anybody replaces 90 with 120, write a literal zero the next
	 * digit landed beside. `readCounts` turns them back.
	 */
	durationMinutes: string;
	minPlayers: string;
	responseDeadlineHours: string;
	matchMinutes: string;
	repeatLookback: string;
}

export const EMPTY_FORM: SeasonForm = {
	name: '',
	status: 'active',
	venueName: '',
	venueAddress: '',
	weekday: 2,
	time: '19:00',
	durationMinutes: '90',
	startDate: '',
	endDate: '',
	minPlayers: '10',
	responseDeadlineHours: '24',
	reminderHours: '72, 24',
	matchMinutes: String(DEFAULT_BALANCE_SETTINGS.matchMinutes),
	randomness: DEFAULT_BALANCE_SETTINGS.randomness * 100,
	repeatPenalty: DEFAULT_BALANCE_SETTINGS.repeatPenalty * 100,
	repeatLookback: String(DEFAULT_BALANCE_SETTINGS.repeatLookback),
};

/**
 * What the form would read if it were showing this season exactly.
 *
 * Needed twice, which is why it is a function: to fill the form when the season
 * arrives, and to compare against afterwards, so the screen can notice the
 * stored season has moved underneath somebody rather than silently overwriting
 * a change they never saw.
 */
export const formFromSeason = (season: Season, balance: BalanceSettings): SeasonForm => ({
	name: season.name,
	status: season.status,
	venueName: season.venue.name,
	venueAddress: season.venue.address ?? '',
	weekday: season.slot.weekday,
	time: season.slot.time,
	durationMinutes: String(season.slot.durationMinutes),
	startDate: season.startDate,
	endDate: season.endDate,
	minPlayers: String(season.minPlayers),
	responseDeadlineHours: String(season.responseDeadlineHours),
	reminderHours: (season.reminderHours ?? []).join(', '),
	matchMinutes: String(balance.matchMinutes),
	randomness: Math.round(balance.randomness * 100),
	repeatPenalty: Math.round(balance.repeatPenalty * 100),
	repeatLookback: String(balance.repeatLookback),
});

/**
 * Whether two forms say the same thing.
 *
 * Every field, deliberately: the screen uses this to decide whether somebody
 * else has edited the season, and a comparison that skipped a field would miss
 * exactly the edit it is watching for.
 */
export const sameForm = (a: SeasonForm, b: SeasonForm): boolean =>
	(Object.keys(a) as (keyof SeasonForm)[]).every(key => a[key] === b[key]);

/**
 * What is wrong with a count box, in the words of the setting rather than of
 * the parser, "at least one minute long" says what to type, where "invalid
 * number" only says to try again.
 */
export const INVALID_COUNT = {
	durationMinutes: 'The slot needs to be at least one minute long.',
	minPlayers: 'A game needs a minimum of at least one player.',
	responseDeadlineHours: 'Answers close a whole number of hours before kick-off.',
	matchMinutes: 'A match needs to be at least one minute long.',
	repeatLookback: 'Looking back has to cover at least one game.',
} as const;

export type CountField = keyof typeof INVALID_COUNT;

export interface SeasonCounts {
	counts: Record<CountField, number | null>;
	/** The first box that doesn't hold a whole number, if any. */
	invalid: CountField | undefined;
}

/**
 * The typed-in numbers, turned back into numbers.
 *
 * The floor is per field, because they are not the same question: a slot, a
 * match and a lookback all need at least one of something, and the response
 * deadline needs zero to be allowed, answers staying open right up to
 * kick-off is a real setting, not an empty box.
 */
export const readCounts = (form: SeasonForm): SeasonCounts => {
	const counts: Record<CountField, number | null> = {
		durationMinutes: parseCount(form.durationMinutes),
		minPlayers: parseCount(form.minPlayers),
		responseDeadlineHours: parseCount(form.responseDeadlineHours, 0),
		matchMinutes: parseCount(form.matchMinutes),
		repeatLookback: parseCount(form.repeatLookback),
	};

	return { counts, invalid: (Object.keys(counts) as CountField[]).find(key => counts[key] === null) };
};
