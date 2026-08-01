import type { SeasonSlot } from './types';
import { addCivilDays, civilDateWeekday, parseCivilDate, parseClockTime, zonedTimeToUtc } from './datetime';

export interface GeneratedGame {
	/** ISO 8601 UTC. */
	kickoff: string;
	/** ISO 8601 UTC. */
	endsAt: string;
}

/** Safety valve so a typo'd date range can't try to generate a million games. */
const MAX_GENERATED_GAMES = 200;

/**
 * Every occurrence of a season's recurring slot between two civil dates,
 * inclusive of both ends.
 *
 * Kickoffs are resolved as wall-clock times in the slot's timezone, so a season
 * that spans a DST change keeps the same local start time throughout.
 */
export const generateGameDates = (slot: SeasonSlot, startDate: string, endDate: string): GeneratedGame[] => {
	const { hours, minutes } = parseClockTime(slot.time);

	// Validate both ends before looping so a bad date fails loudly, not silently.
	parseCivilDate(startDate);
	parseCivilDate(endDate);

	if (endDate < startDate) return [];

	const games: GeneratedGame[] = [];

	// Jump straight to the first matching weekday instead of walking every day.
	const daysUntilFirst = (slot.weekday - civilDateWeekday(startDate) + 7) % 7;
	let date = addCivilDays(startDate, daysUntilFirst);

	while (date <= endDate && games.length < MAX_GENERATED_GAMES) {
		const { year, month, day } = parseCivilDate(date);
		const kickoff = zonedTimeToUtc(year, month, day, hours, minutes, slot.timezone);

		games.push({
			kickoff: kickoff.toISOString(),
			endsAt: new Date(kickoff.getTime() + slot.durationMinutes * 60 * 1000).toISOString(),
		});

		date = addCivilDays(date, 7);
	}

	return games;
};

/**
 * Split generated games against the ones already stored, so regenerating a
 * season adds only what's missing instead of duplicating the whole calendar.
 */
export const diffGeneratedGames = (
	generated: GeneratedGame[],
	existingKickoffs: string[]
): { toCreate: GeneratedGame[]; alreadyExisting: GeneratedGame[] } => {
	const existing = new Set(existingKickoffs);

	return {
		toCreate: generated.filter(game => !existing.has(game.kickoff)),
		alreadyExisting: generated.filter(game => existing.has(game.kickoff)),
	};
};
