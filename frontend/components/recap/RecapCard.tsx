import Link from 'next/link';
import { ChevronRightIcon, SparklesIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { colors, tint } from '../../app/tokens.stylex';
import { focus, nudge, surfaces } from '../../lib/styles';

const styles = stylex.create({
	card: {
		display: 'flex',
		alignItems: 'center',
		gap: 14,
		padding: 16,
		textDecoration: 'none',
		backgroundImage: `linear-gradient(135deg, ${tint.brand20}, transparent 70%)`,
	},
	icon: { width: 28, height: 28, flexShrink: 0, color: colors.brand },
	body: { flexGrow: 1, minWidth: 0 },
	title: { display: 'block', color: colors.ink, fontSize: 16, lineHeight: '22px', fontWeight: 700 },
	note: { display: 'block', color: colors.muted, fontSize: 13, lineHeight: '18px', marginTop: 2 },
	chevron: { width: 20, height: 20, color: colors.faint, flexShrink: 0 },
});

/** The way back into a finished season's recap, at the top of its home screen. */
const RecapCard = ({ seasonId, seasonName }: { seasonId: string; seasonName: string }) => (
	<Link href={`/s/${seasonId}/recap`} {...stylex.props(surfaces.glassCard, focus.ring, nudge.row, styles.card)}>
		<SparklesIcon {...stylex.props(styles.icon)} aria-hidden='true' />
		<span {...stylex.props(styles.body)}>
			<span {...stylex.props(styles.title)}>Watch the season recap</span>
			<span {...stylex.props(styles.note)}>{seasonName} is over.</span>
		</span>
		<ChevronRightIcon {...stylex.props(styles.chevron, nudge.chevron)} aria-hidden='true' />
	</Link>
);

export default RecapCard;
