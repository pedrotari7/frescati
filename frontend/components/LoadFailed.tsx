'use client';

import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import Button from './Button';
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
	icon: { color: colors.pending, marginBottom: 16, width: 48, height: 48 },
	title: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	message: { color: colors.muted, marginTop: 8, maxWidth: 320, fontSize: 14, lineHeight: 1.625 },
	retry: { marginTop: 24 },
	retryIcon: { width: 16, height: 16 },
});

/**
 * What a screen draws when the listener behind it failed.
 *
 * Deliberately not an `EmptyState`, because the two are the states this app was
 * confusing. A subscription that errors settles into "not loading, no data",
 * which is the same shape as a season with no games in it, so a dropped
 * connection, an expired session or a rule that said no all came up as
 * "Season not found. It may have been deleted, or the link is wrong." That
 * names a cause that didn't happen, on a screen with nothing left to press.
 *
 * `what` completes "Couldn't load ___", so it is the thing in the user's words:
 * "this season", "the teams", never the collection it came out of.
 */
const LoadFailed = ({ what, onRetry }: { what: string; onRetry?: () => void }) => (
	<div {...stylex.props(styles.root, animations.fadeIn)}>
		<ExclamationTriangleIcon {...stylex.props(styles.icon)} aria-hidden='true' />

		<p {...stylex.props(styles.title)}>Couldn&apos;t load {what}</p>
		<p {...stylex.props(styles.message)}>
			That is usually the connection rather than anything you did. Nothing has been lost.
		</p>

		{onRetry && (
			<Button variant='secondary' sx={styles.retry} onClick={onRetry}>
				<ArrowPathIcon {...stylex.props(styles.retryIcon)} aria-hidden='true' />
				Try again
			</Button>
		)}
	</div>
);

export default LoadFailed;
