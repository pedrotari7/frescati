'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { signInWithGoogle } from '../lib/auth';
import Button from './Button';
import { colors, tint } from '../app/tokens.stylex';
import { animations, surfaces } from '../lib/styles';

/** Google sign-in popups are blocked inside Facebook's in-app browser. */
const isInAppBrowser = () => typeof navigator !== 'undefined' && /FBAN|FBAV|Instagram/.test(navigator.userAgent);

const styles = stylex.create({
	root: {
		position: 'relative',
		display: 'flex',
		minHeight: '100dvh',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
		paddingInline: 24,
	},

	blobs: { pointerEvents: 'none', position: 'absolute', inset: 0 },
	blob: { position: 'absolute', borderRadius: 9999, filter: 'blur(120px)' },
	blobBrand: { backgroundColor: tint.brand25, top: '-25%', left: '-25%', width: '60vmax', height: '60vmax' },
	blobExtra: { backgroundColor: tint.extra15, right: '-25%', bottom: '-33%', width: '55vmax', height: '55vmax' },

	panel: { position: 'relative', zIndex: 10, width: '100%', maxWidth: 384, textAlign: 'center' },
	crest: {
		backgroundColor: tint.brand15,
		boxShadow: `0 0 0 1px ${tint.brand30}`,
		marginInline: 'auto',
		marginBottom: 24,
		display: 'flex',
		width: 80,
		height: 80,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 24,
		fontSize: 36,
		lineHeight: '40px',
	},
	title: { color: colors.ink, fontSize: 36, lineHeight: '40px', fontWeight: 700, letterSpacing: '-0.025em' },
	blurb: { color: colors.muted, marginTop: 12, fontSize: 14, lineHeight: 1.625 },

	warning: { marginTop: 40, borderRadius: 16, padding: 16, textAlign: 'left' },
	warningTitle: { color: colors.pending, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	warningBody: { color: colors.muted, marginTop: 4, fontSize: 12, lineHeight: 1.625 },

	cta: { marginTop: 40 },
	logo: { width: 20, height: 20, flexShrink: 0 },
	error: { color: colors.out, marginTop: 16, fontSize: 14, lineHeight: '20px' },
});

// Google's brand mark, sitting straight on the button with no chip behind it.
// The only place in the app allowed to hardcode colours, since these four are
// Google's and not ours to re-theme.
const GoogleLogo = () => (
	<svg viewBox='0 0 48 48' {...stylex.props(styles.logo)} aria-hidden='true'>
		<path
			fill='#EA4335'
			d='M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'
		/>
		<path
			fill='#4285F4'
			d='M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'
		/>
		<path
			fill='#FBBC05'
			d='M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.97-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'
		/>
		<path
			fill='#34A853'
			d='M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'
		/>
	</svg>
);

const Login = () => {
	const [error, setError] = useState<string | null>(null);

	const handleSignIn = async () => {
		setError(null);

		try {
			await signInWithGoogle();
		} catch (signInError) {
			const code = (signInError as { code?: string }).code;

			// Dismissing the popup isn't an error worth shouting about.
			if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;

			console.error('Sign-in failed', signInError);
			setError('Could not sign you in. Please try again.');
		}
	};

	return (
		<div {...stylex.props(styles.root)}>
			{/* Two blurred blobs give the flat background some depth. */}
			<div {...stylex.props(styles.blobs)} aria-hidden='true'>
				<div {...stylex.props(styles.blob, styles.blobBrand)} />
				<div {...stylex.props(styles.blob, styles.blobExtra)} />
			</div>

			<div {...stylex.props(styles.panel, animations.rise)}>
				<div {...stylex.props(styles.crest)}>⚽</div>

				<h1 {...stylex.props(styles.title)}>Frescati</h1>
				<p {...stylex.props(styles.blurb)}>
					Say whether you&apos;re in, see who else is, and never count heads in a group chat again.
				</p>

				{isInAppBrowser() ? (
					<div {...stylex.props(surfaces.glassCard, styles.warning)}>
						<p {...stylex.props(styles.warningTitle)}>Open in a real browser</p>
						<p {...stylex.props(styles.warningBody)}>
							Signing in doesn&apos;t work inside this app&apos;s built-in browser. Tap the menu and
							choose &ldquo;Open in Safari&rdquo; or &ldquo;Open in Chrome&rdquo;.
						</p>
					</div>
				) : (
					<Button variant='primary' size='lg' fullWidth sx={styles.cta} onClick={handleSignIn}>
						<GoogleLogo />
						Continue with Google
					</Button>
				)}

				{error && <p {...stylex.props(styles.error)}>{error}</p>}
			</div>
		</div>
	);
};

export default Login;
