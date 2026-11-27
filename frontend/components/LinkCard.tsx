import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { colors } from '../app/tokens.stylex';
import { surfaces } from '../lib/styles';

const styles = stylex.create({
	card: { display: 'block', borderRadius: 16, padding: 16 },
	row: { display: 'flex', alignItems: 'center', gap: 12 },
	icon: { color: colors.brand, width: 20, height: 20, flexShrink: 0, display: 'inline-flex' },
	body: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	title: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	detail: { color: colors.faint, fontSize: 12, lineHeight: '16px' },
	chevron: { color: colors.faint, width: 16, height: 16, flexShrink: 0 },
});

/** A card that is one link: an icon, a title, a line under it and the chevron that says it goes somewhere. */
const LinkCard = ({ href, icon, title, detail }: { href: string; icon: ReactNode; title: string; detail?: string }) => (
	<Link href={href} {...stylex.props(surfaces.glassCard, styles.card)}>
		<div {...stylex.props(styles.row)}>
			<span {...stylex.props(styles.icon)} aria-hidden='true'>
				{icon}
			</span>
			<div {...stylex.props(styles.body)}>
				<p {...stylex.props(styles.title)}>{title}</p>
				{detail && <p {...stylex.props(styles.detail)}>{detail}</p>}
			</div>
			<ChevronRightIcon {...stylex.props(styles.chevron)} aria-hidden='true' />
		</div>
	</Link>
);

export default LinkCard;
