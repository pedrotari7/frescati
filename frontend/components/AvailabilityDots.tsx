import type { Availability, AvailabilityMark } from '@shared/availability';
import { AVAILABILITY_LABELS, describeAvailability, tallyAvailability } from '@shared/availability';
import { formatGameDate } from '@shared/format';
import { classNames } from '../lib/utils/reactHelper';

/**
 * The three answers, as three colours.
 *
 * One table shared with the legend rather than a copy each, the same arrangement
 * `TeamBadge` keeps and for the same reason. An unlabelled dot means nothing
 * except against the key, so a colour changed in one place and not the other
 * does not look broken, it looks like an answer nobody gave.
 *
 * `unanswered` is white at low opacity rather than `bg-faint`, which is a text
 * colour and at six pixels reads as a third answer rather than the absence of
 * one. It has to be visible, though: the dot is what holds the game's place in
 * the row, and a strip that skipped the games nobody answered would put a
 * different week under the same column on every line.
 */
const DOTS: Record<Availability, string> = {
	in: 'bg-in',
	out: 'bg-out',
	unanswered: 'bg-white/15',
};

/** In, out, then the ones nobody answered, which is how the strip is read. */
const LEGEND: Availability[] = ['in', 'out', 'unanswered'];

/**
 * One player's season as a row of dots, oldest game first.
 *
 * Wrapping rather than scrolling, and the wrap is what keeps it legible: every
 * player has a mark for the same games, so every row breaks at the same dot and
 * the columns stay lined up down the list however wide the screen is. A strip
 * that scrolled inside each row would put a different week under your finger on
 * every line.
 *
 * `pending` draws the same dots dimmed and unlabelled. The games are known
 * before the answers are, so the strip can hold its own height instead of
 * appearing under every name at once and shoving the list down, and a dimmed
 * dot says "not yet" where a grey one would say "never answered".
 */
const AvailabilityDots = ({
	marks,
	timezone,
	pending = false,
	className,
}: {
	marks: AvailabilityMark[];
	timezone: string;
	pending?: boolean;
	className?: string;
}) => (
	<span
		// One label for the strip rather than one per dot: thirty of those is a
		// screen reader reading out a season nobody asked for.
		role='img'
		aria-label={pending ? 'Availability, still loading' : describeAvailability(tallyAvailability(marks))}
		className={classNames('flex flex-wrap gap-1', className)}
	>
		{marks.map(mark => (
			<span
				key={mark.gameId}
				title={
					pending
						? undefined
						: `${formatGameDate(mark.kickoff, timezone)} · ${AVAILABILITY_LABELS[mark.availability]}`
				}
				className={classNames('size-1.5 rounded-full', pending ? 'bg-white/5' : DOTS[mark.availability])}
			/>
		))}
	</span>
);

/** What the colours mean, and what one dot is. */
export const AvailabilityLegend = ({ className }: { className?: string }) => (
	<div className={classNames('text-faint flex flex-wrap items-center gap-x-3 gap-y-1 text-xs', className)}>
		<span>One dot a game, oldest first</span>
		{LEGEND.map(availability => (
			<span key={availability} className='flex items-center gap-1.5'>
				<span className={classNames('size-1.5 rounded-full', DOTS[availability])} aria-hidden='true' />
				{AVAILABILITY_LABELS[availability]}
			</span>
		))}
	</div>
);

export default AvailabilityDots;
