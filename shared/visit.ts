/**
 * When somebody last actually looked at Frescati.
 *
 * `lastSeenAt` exists to answer one question — "is this person still around?" —
 * and it is only worth asking if the stamp means *opened it* rather than *has
 * it open*. Both of the obvious ways to record presence get that wrong:
 *
 * - A phone in a pocket with the installed app suspended behind the lock screen
 *   is not a visit, and neither is a laptop tab from last Tuesday sitting
 *   behind forty others. Either one, left to a timer, keeps the stamp
 *   permanently fresh for somebody who quietly stopped turning up — which is
 *   precisely the person the field exists to surface.
 * - Nor can a heartbeat be rescued by only ticking while the page is on screen.
 *   A window left visible on a second monitor is idle, not present, and no
 *   interval can tell those apart without tracking input, which is a great deal
 *   more surveillance than a five-a-side group needs.
 *
 * So the stamp moves on **arrival** and never on a timer: the app loading in
 * the foreground, and every return to it afterwards. The cost is that a long
 * session records when it began rather than when it ended, which is the honest
 * answer to "when did they last come by" anyway.
 */

/**
 * Flicking to another tab and back is the same visit, not a second one.
 *
 * Long enough that a session of alt-tabbing writes once, short enough that
 * coming back after lunch reads as coming back.
 */
export const VISIT_GAP_MS = 10 * 60 * 1000;

/**
 * Whether returning to the foreground is a new visit rather than the tail of
 * the one already recorded.
 *
 * A stamp in the *future* counts as new. That is a clock that was wrong when it
 * was written, and treating it as merely recent would freeze the field until
 * real time caught up with it — which could be days.
 */
export const isNewVisit = (lastSeenAt: string | undefined, now: Date, gapMs: number = VISIT_GAP_MS): boolean => {
	if (!lastSeenAt) return true;

	const elapsed = now.getTime() - new Date(lastSeenAt).getTime();

	// Inverted rather than written as `elapsed >= gapMs`, so the NaN an
	// unparseable stamp produces falls through to `true` — a value we can't
	// read is one worth replacing, not one worth preserving forever.
	return !(elapsed >= 0 && elapsed < gapMs);
};

const DAY_MS = 86_400_000;

/**
 * How long ago somebody was last here, in the only units this group runs in.
 *
 * Measured in weeks rather than a calendar month, because the thing an admin is
 * really asking is "how many games have gone by without them" — and a season is
 * a weekly slot, so a week is one game and four weeks is a month of them. A
 * calendar month would make the same absence read differently in February.
 */
export const RECENT_DAYS = 7;

export const DORMANT_DAYS = 28;

export type VisitRecency = 'thisWeek' | 'thisMonth' | 'dormant' | 'never';

/**
 * `never` is a real state, not a stale one: a profile can exist without anybody
 * having opened the app, because `set-admin` creates one from a uid alone. It
 * also covers a stamp we can't parse — a date we can't read tells us nothing
 * about when they were here, and guessing "recently" would hide them.
 *
 * A stamp from the *future* lands in `thisWeek`, which is the harmless way to
 * be wrong about a clock that was ahead when it wrote.
 */
export const visitRecency = (lastSeenAt: string | undefined, now: Date): VisitRecency => {
	if (!lastSeenAt) return 'never';

	const days = (now.getTime() - new Date(lastSeenAt).getTime()) / DAY_MS;

	if (Number.isNaN(days)) return 'never';
	if (days < RECENT_DAYS) return 'thisWeek';
	if (days < DORMANT_DAYS) return 'thisMonth';

	return 'dormant';
};

/**
 * Most recently here first, with anybody never seen at all at the bottom.
 *
 * Sorted on the raw stamp rather than the bucket, so the order inside a section
 * still means something — "who is closest to dropping off" is the question the
 * dormant section gets read for.
 */
export const byLastSeen = (a: { lastSeenAt?: string }, b: { lastSeenAt?: string }): number => {
	// The epoch stands in for "never", so two of them subtract to nought rather
	// than the `NaN` an infinity would produce — a comparator that returns NaN
	// leaves the whole list in an order the spec doesn't define. Nobody was here
	// in 1970, so it sorts below every real stamp either way.
	const at = (value?: string) => {
		const parsed = value ? new Date(value).getTime() : NaN;

		return Number.isNaN(parsed) ? 0 : parsed;
	};

	return at(b.lastSeenAt) - at(a.lastSeenAt);
};
