import type { Season } from '@shared/types';
import { DEFAULT_BALANCE_SETTINGS } from '@shared/types';
import { EMPTY_FORM, formFromSeason, readCounts, sameForm } from './seasonForm';

const season = (overrides: Partial<Season> = {}): Season =>
	({
		id: 'season-1',
		name: 'Spring 2026',
		status: 'active',
		startDate: '2026-01-06',
		endDate: '2026-06-30',
		venue: { name: 'Frescati IP', address: 'Svante Arrhenius väg 4' },
		slot: { weekday: 2, time: '19:00', durationMinutes: 90, timezone: 'Europe/Stockholm' },
		minPlayers: 10,
		responseDeadlineHours: 24,
		reminderHours: [72, 24],
		memberUids: [],
		adminUids: [],
		...overrides,
	}) as Season;

describe('formFromSeason', () => {
	it('reads the season into the shapes the controls speak', () => {
		const form = formFromSeason(season(), DEFAULT_BALANCE_SETTINGS);

		expect(form.name).toBe('Spring 2026');
		expect(form.venueName).toBe('Frescati IP');
		expect(form.durationMinutes).toBe('90');
		expect(form.minPlayers).toBe('10');
		expect(form.reminderHours).toBe('72, 24');
	});

	// Percentages on the way in, 0–1 on the way back out. The screen's sliders
	// are the only reason this conversion exists.
	it('scales the balance settings into whole percentages', () => {
		const form = formFromSeason(season(), { ...DEFAULT_BALANCE_SETTINGS, randomness: 0.35, repeatPenalty: 0.6 });

		expect(form.randomness).toBe(35);
		expect(form.repeatPenalty).toBe(60);
	});

	it('reads a missing address as an empty box rather than as undefined', () => {
		const form = formFromSeason(season({ venue: { name: 'Frescati IP' } }), DEFAULT_BALANCE_SETTINGS);

		expect(form.venueAddress).toBe('');
	});

	// Every season that existed before finances did has no `fees` map at all, and
	// the form has to open on something rather than on three empty boxes that read
	// back as invalid.
	it('reads a season with no fees as the defaults', () => {
		const form = formFromSeason(season(), DEFAULT_BALANCE_SETTINGS);

		expect(form.seasonCost).toBe('0');
		expect(form.perGameFee).toBe('70');
		expect(form.swish).toBe('');
	});

	it('reads the fees a season carries', () => {
		const form = formFromSeason(
			season({ fees: { total: 31240, perGame: 70, swish: '0701234567' } }),
			DEFAULT_BALANCE_SETTINGS
		);

		expect(form.seasonCost).toBe('31240');
		expect(form.perGameFee).toBe('70');
		expect(form.swish).toBe('0701234567');
	});

	it('reads a season with no reminder windows as an empty box', () => {
		const form = formFromSeason(season({ reminderHours: undefined }), DEFAULT_BALANCE_SETTINGS);

		expect(form.reminderHours).toBe('');
	});

	// A round trip through the form must not move anything on its own, or the
	// staleness check below would fire on every season the moment it loaded.
	it('matches itself, so an untouched form reads as unchanged', () => {
		const live = formFromSeason(season(), DEFAULT_BALANCE_SETTINGS);

		expect(sameForm(live, formFromSeason(season(), DEFAULT_BALANCE_SETTINGS))).toBe(true);
	});
});

describe('sameForm', () => {
	const base = formFromSeason(season(), DEFAULT_BALANCE_SETTINGS);

	it('is true for two forms saying the same thing', () => {
		expect(sameForm(base, { ...base })).toBe(true);
	});

	// The screen decides "somebody else edited this" from this comparison, so a
	// field it skipped would be an edit it never noticed.
	it.each(Object.keys(base) as (keyof typeof base)[])('notices a change to %s', key => {
		const moved = { ...base, [key]: typeof base[key] === 'number' ? (base[key] as number) + 1 : 'moved' };

		expect(sameForm(base, moved)).toBe(false);
	});
});

describe('readCounts', () => {
	it('turns the typed boxes back into numbers', () => {
		const { counts, invalid } = readCounts(EMPTY_FORM);

		expect(invalid).toBeUndefined();
		expect(counts.durationMinutes).toBe(90);
		expect(counts.minPlayers).toBe(10);
	});

	// `Number('')` is 0, which is how an emptied box used to become a season
	// with `minPlayers: 0`, one in which no game can ever be short.
	it('refuses an empty box rather than reading it as zero', () => {
		const { counts, invalid } = readCounts({ ...EMPTY_FORM, minPlayers: '' });

		expect(counts.minPlayers).toBeNull();
		expect(invalid).toBe('minPlayers');
	});

	it('refuses a zero minimum and a zero-length slot', () => {
		expect(readCounts({ ...EMPTY_FORM, minPlayers: '0' }).invalid).toBe('minPlayers');
		expect(readCounts({ ...EMPTY_FORM, durationMinutes: '0' }).invalid).toBe('durationMinutes');
	});

	// Answers staying open right up to kick-off is a real setting, so this one
	// box has a floor of nothing where the others have a floor of one.
	it('allows a response deadline of zero hours', () => {
		const { counts, invalid } = readCounts({ ...EMPTY_FORM, responseDeadlineHours: '0' });

		expect(counts.responseDeadlineHours).toBe(0);
		expect(invalid).toBeUndefined();
	});

	// A season nobody pays for is a season, and extras playing free is a choice
	// somebody makes, so both fees take a zero the way the response deadline does.
	it('allows a bill of nothing and a free game for extras', () => {
		const { counts, invalid } = readCounts({ ...EMPTY_FORM, seasonCost: '0', perGameFee: '0' });

		expect(counts.seasonCost).toBe(0);
		expect(counts.perGameFee).toBe(0);
		expect(invalid).toBeUndefined();
	});

	it('refuses a fee that is not a whole number of kronor', () => {
		expect(readCounts({ ...EMPTY_FORM, seasonCost: '' }).invalid).toBe('seasonCost');
		expect(readCounts({ ...EMPTY_FORM, seasonCost: '31240.50' }).invalid).toBe('seasonCost');
		expect(readCounts({ ...EMPTY_FORM, perGameFee: 'seventy' }).invalid).toBe('perGameFee');
	});

	it('names the first bad box rather than just saying no', () => {
		expect(readCounts({ ...EMPTY_FORM, matchMinutes: 'ten' }).invalid).toBe('matchMinutes');
		expect(readCounts({ ...EMPTY_FORM, repeatLookback: '2.5' }).invalid).toBe('repeatLookback');
	});
});
