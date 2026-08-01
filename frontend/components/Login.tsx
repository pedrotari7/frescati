'use client';

import { useState } from 'react';
import { signInWithGoogle } from '../lib/auth';
import Button from './Button';

/** Google sign-in popups are blocked inside Facebook's in-app browser. */
const isInAppBrowser = () => typeof navigator !== 'undefined' && /FBAN|FBAV|Instagram/.test(navigator.userAgent);

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
						Continue with Google
					</Button>
				)}

				{error && <p className='text-out mt-4 text-sm'>{error}</p>}
			</div>
		</div>
	);
};

export default Login;
