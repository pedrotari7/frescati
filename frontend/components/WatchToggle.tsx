'use client';

import { BellAlertIcon, BellIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { bp, colors, tint } from '../app/tokens.stylex';
import { focus } from '../lib/styles';
import { hapticLight } from '../lib/utils/haptics';

const styles = stylex.create({
	button: {
		// Sized past the 44px touch target with a negative margin, so the
		// tappable area is a thumb's worth without the heading row growing
		// around it.
		marginBlock: -8,
		display: 'inline-flex',
		width: 44,
		height: 44,
		flexShrink: 0,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 9999,
		transitionProperty: 'color, background-color',
		transitionDuration: '0.15s',
		transform: { default: null, ':active': 'scale(0.95)' },
		pointerEvents: { default: null, ':disabled': 'none' },
		opacity: { default: null, ':disabled': 0.4 },
	},
	watching: { color: colors.brand, backgroundColor: tint.brand10 },
	idle: {
		color: { default: colors.faint, [bp.hover]: { default: null, ':hover': colors.muted } },
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
	},
	icon: { width: 20, height: 20 },
});

/**
 * Follow one game, and hear about it whenever somebody's answer moves.
 *
 * Off by default and per game, which is what lets the notification behind it be
 * as chatty as it is, see `notifyWatchers`. There is no profile-level switch to
 * match it: this button is the switch, and it sits on the screen the
 * notification deep-links to, so turning it off is one tap from the thing that
 * prompted you to.
 *
 * A button rather than a `Toggle` because it belongs in the corner of a game
 * card beside the status pills, not in a list of labelled settings rows, but
 * it still reports itself as a switch, so a screen reader gets the state and
 * not just "button".
 */
const WatchToggle = ({
	watching,
	disabled = false,
	onChange,
}: {
	watching: boolean;
	disabled?: boolean;
	onChange: (next: boolean) => void;
}) => {
	const Icon = watching ? BellAlertIcon : BellIcon;

	return (
		<button
			type='button'
			role='switch'
			aria-checked={watching}
			// The icon is the whole control, so the label has to carry what it
			// does as well as what it currently is.
			aria-label={watching ? 'Stop notifying me when answers change' : 'Notify me when answers change'}
			title={watching ? 'Notifying you when answers change' : 'Notify me when answers change'}
			disabled={disabled}
			onClick={() => {
				hapticLight();
				onChange(!watching);
			}}
			{...stylex.props(styles.button, focus.ring, watching ? styles.watching : styles.idle)}
		>
			<Icon {...stylex.props(styles.icon)} aria-hidden='true' />
		</button>
	);
};

export default WatchToggle;
