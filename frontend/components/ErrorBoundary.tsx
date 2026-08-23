'use client';

import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { captureErrorAndFlush } from '../lib/sentry';

interface Props {
	children: ReactNode;
}

interface State {
	error: Error | null;
}

/** When this tab last reloaded itself out of a crash. */
const RELOAD_KEY = 'frescati:error-reload';

/**
 * How long a reload gets to prove it worked.
 *
 * Landing back here inside this window means the reload was not the answer, so
 * the fallback below is what the person should see. Landing back here an hour
 * later is a new problem and deserves its own attempt, which is why this is a
 * timestamp rather than a once-per-session flag that would leave a phone stuck
 * asking for a manual tap for the rest of the day.
 */
const RELOAD_WINDOW_MS = 10_000;

/**
 * Whether to reload, recording the attempt if so.
 *
 * `sessionStorage` throws outright when storage is blocked, Safari has done
 * this in private mode, and it is exactly the sort of phone this app runs on.
 * A boundary that throws while handling an error leaves the app with no
 * fallback at all, so both directions swallow. Being unable to *record* the
 * attempt means not taking it: an unguarded reload on a deterministic crash is
 * an infinite loop, and the button in the fallback still works.
 */
const claimReload = () => {
	try {
		const last = Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0;
		if (Date.now() - last < RELOAD_WINDOW_MS) return false;

		window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
		return true;
	} catch {
		return false;
	}
};

/**
 * Class component because React still has no hook equivalent of
 * `componentDidCatch`.
 */
class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error('Unhandled UI error', error, info.componentStack);

		// React has already swallowed this to render the fallback below, so
		// Sentry's global handler will never see it. The component stack is the
		// useful half, it names the screen, which a minified trace may not.
		//
		// Flushed rather than fired and forgotten because of the reload below.
		const reported = captureErrorAndFlush(error, { componentStack: info.componentStack });

		// The fallback already says reloading usually sorts it out, so do it
		// instead of asking. Not everything that lands here is fixable that way,
		// but the errors that reach a phone disproportionately are: a chunk that
		// never arrived on one bar of signal leaves a module missing from the
		// bundle, and nothing short of fetching it again will do. The reload
		// gets it, because a failed response is never cached, see `sw.js`.
		//
		// Once per episode. If this was a real bug in the tree it throws again
		// on the way back, `claimReload` says no the second time, and the person
		// gets the message rather than a page that flickers forever.
		if (claimReload()) void reported.then(() => window.location.reload());
	}

	render() {
		if (!this.state.error) return this.props.children;

		return (
			<div className='flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center'>
				<p className='text-ink text-lg font-semibold'>Something broke</p>
				<p className='text-muted max-w-xs text-sm'>That&apos;s on us. Reloading usually sorts it out.</p>
				<button
					type='button'
					onClick={() => window.location.reload()}
					className='bg-brand text-canvas mt-2 h-11 rounded-xl px-5 text-sm font-semibold'
				>
					Reload
				</button>
			</div>
		);
	}
}

export default ErrorBoundary;
