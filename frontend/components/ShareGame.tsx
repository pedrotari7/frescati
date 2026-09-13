'use client';

import { ShareIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { Game, Season } from '@shared/types';
import { buildGameShare } from '@shared/share';
import { useToast } from './Toast';
import { useWrite } from '../hooks/useWrite';
import { shareOrCopy } from '../lib/utils/share';
import { hapticLight } from '../lib/utils/haptics';
import { bp, colors, tint } from '../app/tokens.stylex';
import { focus } from '../lib/styles';

const styles = stylex.create({
	button: {
		// The bell's geometry, because it sits next to the bell: past the 44px
		// touch target, with a negative margin so the row doesn't grow around it.
		color: { default: colors.faint, [bp.hover]: { default: null, ':hover': colors.muted } },
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
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
	},
	icon: { width: 20, height: 20 },
});

/**
 * Post this game into whatever chat the group actually uses.
 *
 * The app is signed-in only and has no public page for a game, which is the
 * right trade for everything else and leaves one hole: the people who could
 * rescue a game that is two short are the ones who haven't opened it this week.
 * This is the way out of that, and it deliberately writes the message rather
 * than just copying a link, since a bare URL into a group chat asks everybody
 * to open an app to find out whether it's worth opening.
 *
 * `shared/share.ts` holds the copy. Nothing here decides what it says.
 */
const ShareGame = ({ game, season }: { game: Game; season: Season }) => {
	const { notify } = useToast();
	const write = useWrite();

	const share = async () => {
		hapticLight();

		// `useWrite` is not only for Firestore: it is the one place that catches
		// a failed async action, says so and reports it, which a rejected share
		// or clipboard write needs as much as a rejected write does. Same
		// reasoning as the calendar sheet's copy button.
		await write(async () => {
			// Read at tap time rather than at render: this is the only thing on
			// the card that needs an absolute URL, and reading it during render
			// would make the component refuse to render on the server.
			const outcome = await shareOrCopy(buildGameShare(game, season, { appUrl: window.location.origin }));

			// The system sheet is its own confirmation, and a toast behind it
			// lands after it has closed, saying so a second time. A copy has
			// nothing to show for itself at all, so it is the one that needs a
			// word. A dismissed sheet gets neither.
			if (outcome === 'copied') notify('Copied, paste it in the chat');
		}, "Couldn't share this game.");
	};

	return (
		<button
			type='button'
			onClick={share}
			aria-label='Share this game'
			title='Share this game'
			{...stylex.props(styles.button, focus.ring)}
		>
			<ShareIcon {...stylex.props(styles.icon)} aria-hidden='true' />
		</button>
	);
};

export default ShareGame;
