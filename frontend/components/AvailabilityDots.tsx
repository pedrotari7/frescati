import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import type { Availability, AvailabilityMark } from '@shared/availability';
import { AVAILABILITY_LABELS, describeAvailability, tallyAvailability } from '@shared/availability';
import { formatGameDate } from '@shared/format';
import { colors, tint } from '../app/tokens.stylex';

/**
 * The three answers, as three colours.
 *
 * One table shared with the legend rather than a copy each, the same arrangement
 * `TeamBadge` keeps and for the same reason. An unlabelled dot means nothing
 * except against the key, so a colour changed in one place and not the other
 * does not look broken, it looks like an answer nobody gave.
 *
 * `unanswered` is white at low opacity rather than the faint text colour, which
 * at six pixels reads as a third answer rather than the absence of one. It has
 * to be visible, though: the dot is what holds the game's place in the row, and
 * a strip that skipped the games nobody answered would put a different week
 * under the same column on every line.
 */
const DOTS = stylex.create({
	in: { backgroundColor: colors.in },
	out: { backgroundColor: colors.out },
	unanswered: { backgroundColor: tint.white15 },
});

const styles = stylex.create({
	strip: { display: 'flex', flexWrap: 'wrap', gap: 4 },
	dot: { width: 6, height: 6, borderRadius: 9999 },
	loading: { backgroundColor: tint.white5 },

	legend: {
		color: colors.faint,
		display: 'flex',
		flexWrap: 'wrap',
		alignItems: 'center',
		columnGap: 12,
		rowGap: 4,
		fontSize: 12,
		lineHeight: '16px',
	},
	key: { display: 'flex', alignItems: 'center', gap: 6 },
});

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
	sx,
}: {
	marks: AvailabilityMark[];
	timezone: string;
	pending?: boolean;
	sx?: StyleXStyles;
}) => (
	<span
		// One label for the strip rather than one per dot: thirty of those is a
		// screen reader reading out a season nobody asked for.
		role='img'
		aria-label={pending ? 'Availability, still loading' : describeAvailability(tallyAvailability(marks))}
		{...stylex.props(styles.strip, sx)}
	>
		{marks.map(mark => (
			<span
				key={mark.gameId}
				title={
					pending
						? undefined
						: `${formatGameDate(mark.kickoff, timezone)} · ${AVAILABILITY_LABELS[mark.availability]}`
				}
				{...stylex.props(styles.dot, pending ? styles.loading : DOTS[mark.availability])}
			/>
		))}
	</span>
);

/** What the colours mean, and what one dot is. */
export const AvailabilityLegend = ({ sx }: { sx?: StyleXStyles }) => (
	<div {...stylex.props(styles.legend, sx)}>
		<span>One dot a game, oldest first</span>
		{LEGEND.map(availability => (
			<span key={availability} {...stylex.props(styles.key)}>
				<span {...stylex.props(styles.dot, DOTS[availability])} aria-hidden='true' />
				{AVAILABILITY_LABELS[availability]}
			</span>
		))}
	</div>
);

export default AvailabilityDots;
