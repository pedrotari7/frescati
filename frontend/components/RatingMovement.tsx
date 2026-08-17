import type { ReactNode } from 'react';
import { toDisplayMovement } from '@shared/leaderboard';
import { signed } from '@shared/format';
import { classNames } from '../lib/utils/reactHelper';

/**
 * What one game did to somebody's rating.
 *
 * Rendered on the displayed 0–100 scale rather than in Elo, so it agrees with
 * the number beside it: a game worth 30 Elo reads as +6.
 *
 * **A change that rounds to nothing renders nothing.** That is the rule this
 * component exists to hold in one place — the team sheet and the player profile
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
 * no colour of its own and does need to print `0` — a blank cell in a table
 * column reads as missing data, not as "no change". It shares `signed` and
 * nothing else.
 */
const RatingMovement = ({
	delta,
	className = 'text-xs',
	flat = null,
}: {
	/** Elo, not the displayed scale. `undefined` when the game has not been rated. */
	delta: number | undefined;
	className?: string;
	/** What to draw when the change rounds to nothing. */
	flat?: ReactNode;
}) => {
	if (delta === undefined) return null;

	const shown = toDisplayMovement(delta);

	if (shown === 0) return <>{flat}</>;

	return (
		<span className={classNames('font-semibold tabular-nums', shown > 0 ? 'text-in' : 'text-out', className)}>
			{signed(shown)}
		</span>
	);
};

export default RatingMovement;
