import type { ReactNode } from 'react';
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
});

/**
 * What one game did to somebody's rating.
 *
 * Rendered on the displayed 0–100 scale rather than in Elo, so it agrees with
 * the number beside it: a game worth 30 Elo reads as +6.
 *
 * **A change that rounds to nothing renders nothing.** That is the rule this
 * component exists to hold in one place. The team sheet and the player profile
 * each documented it in a comment and then implemented it differently, one
 * returning `null` and the other an em dash, which is a divergence rather than
 * a decision. `flat` is now what that choice is called, so a caller picks it on
 * purpose: a dash where the column would otherwise collapse, nothing where the
 * row reads fine without it.
 *
 * `+0` is what both were avoiding. The displayed scale is coarse enough that a
 * real game routinely moves somebody by less than a point, and a badge claiming
 * a change of zero reads as a result rather than as rounding.
 *
 * The season table deliberately does *not* use this. Its movement is the
 * headline number in a column that shows a rating on the other tab, so it needs
 * no colour of its own and does need to print `0`. A blank cell in a table
 * column reads as missing data, not as "no change". It shares `signed` and
 * nothing else.
 */
const RatingMovement = ({
	delta,
	sx,
	flat = null,
}: {
	/** Elo, not the displayed scale. `undefined` when the game has not been rated. */
	delta: number | undefined;
	sx?: StyleXStyles;
	/** What to draw when the change rounds to nothing. */
	flat?: ReactNode;
}) => {
	if (delta === undefined) return null;

	const shown = toDisplayMovement(delta);

	if (shown === 0) return <>{flat}</>;

	return <span {...stylex.props(styles.movement, shown > 0 ? styles.up : styles.down, sx)}>{signed(shown)}</span>;
};

export default RatingMovement;
