import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { toDisplayMovement } from '@shared/leaderboard';
import { signed } from '@shared/format';
import { colors } from '../app/tokens.stylex';

const styles = stylex.create({
	/*
	 * The 12px is a default rather than a prop default, which is what
	 * `className = 'text-xs'` was pretending to be: a caller passing its own size
	 * used to replace this one only because it happened to come later in the
	 * concatenated string. Here the later style genuinely wins, so `sx` overrides
	 * it and a caller that passes nothing still gets 12px.
	 */
	movement: { fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 12, lineHeight: '16px' },
	up: { color: colors.in },
	down: { color: colors.out },
	level: { color: colors.faint },
});

/**
 * What one game did to somebody's rating.
 *
 * Rendered on the displayed 0–100 scale rather than in Elo, so it agrees with
 * the number beside it: a game worth 30 Elo reads as +6.
 *
 * **A change that rounds away still gets a badge, signed.** A display point is
 * five Elo, which is coarse enough that a real game routinely moves somebody by
 * less than one, so a whole squad went blank on the team sheet while the two
 * cards beside it read +2 and -2. Blank says the game did nothing to them, and
 * the team sheet is the one screen where three squads are read against each
 * other. `+0` and `-0` say it moved them by less than the scale can show, and
 * which way.
 *
 * The sign and the colour come off the Elo rather than off the rounded number,
 * because the rounding is what took the direction away.
 *
 * A movement of *exactly* zero is the third case and reads `0`, in neither
 * colour. Nothing rounded and there is no direction to report. That is a
 * tournament where every fixture was drawn, or a first appearance on a ledger
 * entry old enough that the rating it worked off was never stored, leaving no
 * distance to measure.
 *
 * The season table deliberately does *not* use this. Its movement is the
 * headline number in a column that shows a rating on the other tab, so it needs
 * no colour of its own, and a season that rounds away still prints a plain `0`.
 * Half a display point spread over twelve games has no direction worth reading.
 * It shares `signed` and nothing else.
 */
const RatingMovement = ({
	delta,
	sx,
}: {
	/** Elo, not the displayed scale. `undefined` when the game has not been rated. */
	delta: number | undefined;
	sx?: StyleXStyles;
}) => {
	if (delta === undefined) return null;

	const shown = toDisplayMovement(delta);

	// `signed` prints an unsigned `0`, which is right for the movement that is
	// genuinely nothing and wrong for the one that rounded to nothing.
	const label = shown !== 0 ? signed(shown) : delta > 0 ? '+0' : delta < 0 ? '-0' : '0';

	return (
		<span {...stylex.props(styles.movement, delta > 0 ? styles.up : delta < 0 ? styles.down : styles.level, sx)}>
			{label}
		</span>
	);
};

export default RatingMovement;
