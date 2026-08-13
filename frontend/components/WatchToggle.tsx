'use client';

import { BellAlertIcon, BellIcon } from '@heroicons/react/24/outline';
import { classNames } from '../lib/utils/reactHelper';
import { hapticLight } from '../lib/utils/haptics';

/**
 * Follow one game, and hear about it whenever somebody's answer moves.
 *
 * Off by default and per game, which is what lets the notification behind it be
 * as chatty as it is — see `notifyWatchers`. There is no profile-level switch to
 * match it: this button is the switch, and it sits on the screen the
 * notification deep-links to, so turning it off is one tap from the thing that
 * prompted you to.
 *
 * A button rather than a `Toggle` because it belongs in the corner of a game
 * card beside the status pills, not in a list of labelled settings rows — but
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
			className={classNames(
				// Sized past the 44px touch target with a negative margin, so the
				// tappable area is a thumb's worth without the heading row growing
				// around it.
				'-my-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors',
				'focus-visible:ring-brand/60 focus-visible:ring-2 focus-visible:outline-none',
				'active:scale-[0.95] disabled:pointer-events-none disabled:opacity-40',
				watching ? 'text-brand bg-brand/10' : 'text-faint hover:text-muted hover:bg-white/5'
			)}
		>
			<Icon className='size-5' aria-hidden='true' />
		</button>
	);
};

export default WatchToggle;
