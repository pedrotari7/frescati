'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import './globals.css';

/**
 * The last resort, for a crash in the root layout itself.
 *
 * `components/ErrorBoundary` handles everything below it, but it is mounted
 * *inside* that layout — so if the layout throws, it never mounts and nothing
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
			<body className='bg-canvas'>
				<div className='flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center'>
					<p className='text-ink text-lg font-semibold'>Something broke</p>
					<p className='text-muted max-w-xs text-sm'>
						That&apos;s on us. Reloading usually sorts it out.
					</p>
					<button
						type='button'
						onClick={() => window.location.reload()}
						className='bg-brand text-canvas mt-2 h-11 rounded-xl px-5 text-sm font-semibold'
					>
						Reload
					</button>
				</div>
			</body>
		</html>
	);
};

export default GlobalError;
