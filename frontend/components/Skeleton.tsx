import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { tint } from '../app/tokens.stylex';
import { animations } from '../lib/styles';

const styles = stylex.create({
	block: { position: 'relative', overflow: 'hidden', borderRadius: 12, backgroundColor: tint.white5 },
	sheen: {
		position: 'absolute',
		inset: 0,
		transform: 'translateX(-100%)',
		backgroundImage: `linear-gradient(to right, transparent, ${tint.white10}, transparent)`,
	},
	/*
	 * `space-y-4` was a rule about the gaps between somebody else's children,
	 * which StyleX will not write. A flex column with a gap is the same picture
	 * and needs no selector, and it is what the rest of the app's stacks became
	 * for the same reason.
	 */
	stack: { display: 'flex', flexDirection: 'column', gap: 16, padding: 16 },
	hero: { height: 208, borderRadius: 24 },
	heading: { height: 20, width: 128 },
	row: { height: 80 },
});

export const SkeletonBlock = ({ sx }: { sx?: StyleXStyles }) => (
	<div {...stylex.props(styles.block, sx)}>
		<div {...stylex.props(styles.sheen, animations.shimmer)} />
	</div>
);

/** Mirrors the season home layout so the page doesn't jump when data lands. */
const Skeleton = () => (
	<div {...stylex.props(styles.stack)}>
		<SkeletonBlock sx={styles.hero} />
		<SkeletonBlock sx={styles.heading} />
		<SkeletonBlock sx={styles.row} />
		<SkeletonBlock sx={styles.row} />
		<SkeletonBlock sx={styles.row} />
	</div>
);

export default Skeleton;
