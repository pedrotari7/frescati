'use client';

import { ArrowPathIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { BottomSlot } from './BottomStack';
import Button from './Button';
import { colors, tint } from '../app/tokens.stylex';
import { animations, elevation } from '../lib/styles';

const styles = stylex.create({
	card: {
		backgroundColor: tint.raised95,
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: tint.line60,
		marginInline: 'auto',
		display: 'flex',
		maxWidth: 448,
		alignItems: 'center',
		gap: 12,
		borderRadius: 16,
		padding: 16,
		backdropFilter: 'blur(24px)',
		WebkitBackdropFilter: 'blur(24px)',
	},
	badge: {
		backgroundColor: tint.brand15,
		color: colors.brand,
		display: 'flex',
		width: 40,
		height: 40,
		flexShrink: 0,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 12,
	},
	icon: { width: 20, height: 20 },
	text: { minWidth: 0, flexGrow: 1 },
	title: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	sub: { color: colors.muted, marginTop: 2, fontSize: 12, lineHeight: '16px' },
});

/**
 * Offers the new build that is sitting behind the running one.
 *
 * No dismiss. Everything else that appears down here is a suggestion somebody
 * is entitled to refuse forever, the install banner writes its refusal to
 * `localStorage` and never asks again. This is a build already downloaded and
 * waiting, and the answer is either "now" or "next time you open the app",
 * which closing the tab already means. A dismiss button would offer a third
 * answer, "keep running the old one", that nobody wants and that is exactly
 * the state the whole change exists to get people out of.
 *
 * Sits in the same slot as `PwaInstallPrompt` and above it, on the rare
 * occasion both are up: an update is a thing to act on now, an install nudge
 * has been waiting weeks. That ordering is `BottomStack`'s to enforce now,
 * these two used to be separate fixed elements at the same offset, so "above"
 * meant "exactly on top of".
 */
const UpdatePrompt = ({ onReload }: { onReload: () => void }) => (
	<BottomSlot order={1}>
		<div {...stylex.props(styles.card, elevation.glass, animations.rise)}>
			<div {...stylex.props(styles.badge)}>
				<ArrowPathIcon {...stylex.props(styles.icon)} aria-hidden='true' />
			</div>

			<div {...stylex.props(styles.text)}>
				<p {...stylex.props(styles.title)}>A new version is ready</p>
				<p {...stylex.props(styles.sub)}>Reload to pick it up.</p>
			</div>

			<Button size='sm' variant='primary' onClick={onReload}>
				Reload
			</Button>
		</div>
	</BottomSlot>
);

export default UpdatePrompt;
