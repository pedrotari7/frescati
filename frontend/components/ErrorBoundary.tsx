'use client';

import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { captureError } from '../lib/sentry';

interface Props {
	children: ReactNode;
}

interface State {
	error: Error | null;
}

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
		// useful half — it names the screen, which a minified trace may not.
		void captureError(error, { componentStack: info.componentStack });
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
