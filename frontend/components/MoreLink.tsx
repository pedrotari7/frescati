import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import type { StyleXStyles } from '@stylexjs/stylex';
import { bp, colors, tint } from '../app/tokens.stylex';
import { focus, nudge } from '../lib/styles';

const styles = stylex.create({
	/* Bleeds into the card's padding so a pressed row reaches its edge. */
	more: {
		marginInline: -8,
		display: 'flex',
		alignItems: 'center',
		gap: 8,
		borderRadius: 12,
		paddingInline: 8,
		paddingBlock: 8,
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	label: {
		color: colors.brand,
		minWidth: 0,
		flexGrow: 1,
		flexBasis: '0%',
		fontSize: 14,
		lineHeight: '20px',
		fontWeight: 600,
	},
	icon: { color: colors.faint, width: 16, height: 16, flexShrink: 0 },
});

/**
 * The last row of a callout card: a sentence in the brand colour, a chevron
 * against the right edge, and the whole strip as the tap target.
 *
 * `MotmVoteCallout` and `SeasonDebtNotice` had this three times over between
 * them, identical down to the `nudge.row` and `nudge.chevron` that make the
 * chevron lean on hover. The cards themselves stay separate, because one is a
 * vote that expires and the other is money owed and they share nothing else.
 *
 * `sx` takes the caller's spacing, which is the one thing that differed: a card
 * whose rows already carry a gap wants the vertical bleed and one that does not
 * does not.
 */
const MoreLink = ({ href, children, sx }: { href: string; children: ReactNode; sx?: StyleXStyles }) => (
	<Link href={href} {...stylex.props(focus.ring, nudge.row, styles.more, sx)}>
		<span {...stylex.props(styles.label)}>{children}</span>
		<ChevronRightIcon {...stylex.props(styles.icon, nudge.chevron)} aria-hidden='true' />
	</Link>
);

export default MoreLink;
