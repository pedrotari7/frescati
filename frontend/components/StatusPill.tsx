import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { colors, tint } from '../app/tokens.stylex';

export type PillTone = 'in' | 'out' | 'pending' | 'extra' | 'neutral' | 'brand';

/*
 * Was `bg-in/15 text-in ring-in/25` and five more like it. The ring is an inset
 * shadow rather than a border for the reason every ring in this app is: the
 * pill is already sized by its padding, and a border would grow it by 2px.
 */
const tones = stylex.create({
	in: { backgroundColor: tint.in15, color: colors.in, boxShadow: `inset 0 0 0 1px ${tint.in25}` },
	out: { backgroundColor: tint.out15, color: colors.out, boxShadow: `inset 0 0 0 1px ${tint.out25}` },
	pending: {
		backgroundColor: tint.pending15,
		color: colors.pending,
		boxShadow: `inset 0 0 0 1px ${tint.pending25}`,
	},
	extra: { backgroundColor: tint.extra15, color: colors.extra, boxShadow: `inset 0 0 0 1px ${tint.extra25}` },
	neutral: { backgroundColor: tint.white8, color: colors.muted, boxShadow: `inset 0 0 0 1px ${tint.white10}` },
	brand: { backgroundColor: tint.brand15, color: colors.brand, boxShadow: `inset 0 0 0 1px ${tint.brand25}` },
});

const styles = stylex.create({
	pill: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: 4,
		borderRadius: 9999,
		paddingInline: 8,
		paddingBlock: 2,
		fontSize: 11,
		fontWeight: 600,
		whiteSpace: 'nowrap',
	},
});

const StatusPill = ({
	tone = 'neutral',
	children,
	sx,
}: {
	tone?: PillTone;
	children: ReactNode;
	sx?: StyleXStyles;
}) => <span {...stylex.props(styles.pill, tones[tone], sx)}>{children}</span>;

export default StatusPill;
