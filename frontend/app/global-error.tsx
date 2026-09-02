'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import * as stylex from '@stylexjs/stylex';
import { colors } from './tokens.stylex';
import './globals.css';

const styles = stylex.create({
	body: { backgroundColor: colors.canvas },
	panel: {
		display: 'flex',
		minHeight: '100dvh',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 16,
		padding: 32,
		textAlign: 'center',
	},
	title: { color: colors.ink, fontSize: 18, lineHeight: '28px', fontWeight: 600 },
	blurb: { color: colors.muted, maxWidth: 320, fontSize: 14, lineHeight: '20px' },
	button: {
		backgroundColor: colors.brand,
		color: colors.canvas,
		marginTop: 8,
		height: 44,
		borderRadius: 12,
		paddingInline: 20,
		fontSize: 14,
		lineHeight: '20px',
		fontWeight: 600,
	},
});

/**
 * The last resort, for a crash in the root layout itself.
 *
 * `components/ErrorBoundary` handles everything below it, but it is mounted
 * *inside* that layout, so if the layout throws, it never mounts and nothing
 * catches anything. Next swaps this in instead, replacing the whole document,
 * which is why it renders its own `<html>` and has to pull in the stylesheet
 * the layout would normally have loaded.
 *
 * Rare and total: this is the whole app being a blank page for everybody at
 * once, so it reports unconditionally rather than being sampled.
 */
const GlobalError = ({ error }: { error: Error & { digest?: string } }) => {
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

	return (
		<html lang='en'>
			<body {...stylex.props(styles.body)}>
				<div {...stylex.props(styles.panel)}>
					<p {...stylex.props(styles.title)}>Something broke</p>
					<p {...stylex.props(styles.blurb)}>That&apos;s on us. Reloading usually sorts it out.</p>
					<button type='button' onClick={() => window.location.reload()} {...stylex.props(styles.button)}>
						Reload
					</button>
				</div>
			</body>
		</html>
	);
};

export default GlobalError;
