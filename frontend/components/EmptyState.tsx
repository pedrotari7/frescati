import type { ReactElement, ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '../app/tokens.stylex';
import { animations } from '../lib/styles';

const styles = stylex.create({
	root: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		paddingInline: 24,
		paddingBlock: 64,
		textAlign: 'center',
	},
	iconWrap: { color: colors.faint, marginBottom: 16 },
	icon: { width: 48, height: 48 },
	title: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	message: { color: colors.muted, marginTop: 8, maxWidth: 320, fontSize: 14, lineHeight: 1.625 },
	action: { marginTop: 24 },
});

/**
 * Sizes the icon by handing it a style rather than by reaching down at it.
 *
 * This used to be `[&>svg]:size-12` on the wrapper. StyleX has no way to write
 * that: it only ever styles the element the class is on, so a rule about
 * somebody else's child is not something it can express, by design rather than
 * by omission. Every caller passes a bare Heroicon with no size of its own, so
 * the size has to reach the icon somehow, and cloning it is the one route that
 * leaves all ten call sites alone.
 */
const sizedIcon = (icon: ReactNode): ReactNode =>
	isValidElement(icon) ? cloneElement(icon as ReactElement<object>, stylex.props(styles.icon)) : icon;

const EmptyState = ({
	icon,
	title,
	message,
	action,
}: {
	icon?: ReactNode;
	title: string;
	message?: string;
	action?: ReactNode;
}) => (
	<div {...stylex.props(styles.root, animations.fadeIn)}>
		{icon && <div {...stylex.props(styles.iconWrap)}>{sizedIcon(icon)}</div>}
		<p {...stylex.props(styles.title)}>{title}</p>
		{message && <p {...stylex.props(styles.message)}>{message}</p>}
		{action && <div {...stylex.props(styles.action)}>{action}</div>}
	</div>
);

export default EmptyState;
