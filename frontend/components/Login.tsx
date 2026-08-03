'use client';

import { useState } from 'react';
import { signInWithGoogle } from '../lib/auth';
import Button from './Button';

/** Google sign-in popups are blocked inside Facebook's in-app browser. */
const isInAppBrowser = () => typeof navigator !== 'undefined' && /FBAN|FBAV|Instagram/.test(navigator.userAgent);

// Google's brand mark, sitting straight on the button with no chip behind it.
// The only place in the app allowed to hardcode colours, since these four are
// Google's and not ours to re-theme.
const GoogleLogo = () => (
	<svg viewBox='0 0 48 48' className='size-5 shrink-0' aria-hidden='true'>
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
		<div className='relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6'>
			{/* Two blurred blobs give the flat background some depth. */}
			<div className='pointer-events-none absolute inset-0' aria-hidden='true'>
				<div className='bg-brand/25 absolute -top-1/4 -left-1/4 size-[60vmax] rounded-full blur-[120px]' />
				<div className='bg-extra/15 absolute -right-1/4 -bottom-1/3 size-[55vmax] rounded-full blur-[120px]' />
			</div>

			<div className='animate-rise relative z-10 w-full max-w-sm text-center'>
				<div className='bg-brand/15 ring-brand/30 mx-auto mb-6 flex size-20 items-center justify-center rounded-3xl text-4xl ring-1'>
					⚽
				</div>

				<h1 className='text-ink text-4xl font-bold tracking-tight'>Frescati</h1>
				<p className='text-muted mt-3 text-sm leading-relaxed'>
					Say whether you&apos;re in, see who else is, and never count heads in a group chat again.
				</p>

				{isInAppBrowser() ? (
					<div className='glass-card mt-10 rounded-2xl p-4 text-left'>
						<p className='text-pending text-sm font-semibold'>Open in a real browser</p>
						<p className='text-muted mt-1 text-xs leading-relaxed'>
							Signing in doesn&apos;t work inside this app&apos;s built-in browser. Tap the menu and
							choose &ldquo;Open in Safari&rdquo; or &ldquo;Open in Chrome&rdquo;.
						</p>
					</div>
				) : (
					<Button variant='primary' size='lg' fullWidth className='mt-10' onClick={handleSignIn}>
						<GoogleLogo />
						Continue with Google
					</Button>
				)}

				{error && <p className='text-out mt-4 text-sm'>{error}</p>}
			</div>
		</div>
	);
};

export default Login;
