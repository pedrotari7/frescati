import Link from 'next/link';
import { SparklesIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { colors } from '../../app/tokens.stylex';
import { focus, panel, surfaces } from '../../lib/styles';

const styles = stylex.create({
	button: {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		height: 44,
		paddingInline: 18,
		borderRadius: 12,
		color: colors.ink,
		fontSize: 14,
		fontWeight: 600,
		textDecoration: 'none',
	},
	hint: { color: colors.faint, fontSize: 13 },
});

/**
 * Opens the picked season's recap early, for an app admin checking how it will
 * look. Built from the games rated so far, labelled as a preview, and never
 * counted as watched, so it doesn't use up the real one at the end.
 */
const RecapPreviewCard = ({ seasonId }: { seasonId: string | null }) => (
	<section {...stylex.props(surfaces.glass, panel.card)}>
		<div {...stylex.props(panel.head)}>
			<SparklesIcon {...stylex.props(panel.headIcon)} aria-hidden='true' />
			<h2 {...stylex.props(panel.title)}>Season recap</h2>
		</div>

		<p {...stylex.props(panel.blurb)}>
			The end-of-season story, from the games rated so far. It opens for you only, says it is a preview, and
			watching it does not count.
		</p>

		{seasonId ? (
			<Link
				href={`/s/${seasonId}/recap?preview=1`}
				{...stylex.props(surfaces.glassCard, focus.ring, styles.button)}
			>
				Preview recap
			</Link>
		) : (
			<p {...stylex.props(styles.hint)}>Pick a season above to preview its recap.</p>
		)}
	</section>
);

export default RecapPreviewCard;
