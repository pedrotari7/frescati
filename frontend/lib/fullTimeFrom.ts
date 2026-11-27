import { DEV_MODE } from './devUsers';

/**
 * Full-time cards are for games from here on: the first kickoff that gets one,
 * the start of 28 November 2026 in Stockholm.
 *
 * Without it, the day this shipped everybody whose last game was in the past
 * week would have been met by a card for it, a surprise about a game they had
 * already forgotten. Only the debug preview looks past it.
 *
 * `null` on the emulators, whose history is all seeded in the past, so cards
 * still show for `dev:seeded` and the e2e suite.
 */
export const FULL_TIME_FROM: string | null = DEV_MODE ? null : '2026-11-27T23:00:00.000Z';
