'use client';

import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { BugAntIcon } from '@heroicons/react/24/outline';
import type { BackendErrorKind } from '@shared/debug';
import { getDb } from '../lib/firebaseClient';
import { throwTestError } from '../lib/db/testError';
import { useWrite } from '../hooks/useWrite';
import { useToast } from '../components/Toast';
import Button from './Button';

/**
 * Breaks things on purpose, so error reporting can be proved rather than hoped
 * for.
 *
 * A reporting pipeline looks identical working and broken — a typo'd DSN, a
 * content blocker eating the tunnel, a source map that never uploaded, a flush
 * frozen before it landed. All of them present as a quiet inbox, which is also
 * what a good week looks like. The only way to tell them apart is to break
 * something deliberately and go and look.
 *
 * Each button takes a genuinely different route into Sentry. That matters more
 * than it sounds: React swallows render errors to show a fallback, ignores
 * throws from event handlers entirely, and neither of those is how a rejected
 * Firestore write surfaces. One button passing says nothing about the others.
 */

/** Throws while rendering. The only way to reach `ErrorBoundary` on purpose. */
const Boom = (): never => {
	throw new Error('Debug: deliberate render failure');
};

interface Trigger {
	id: string;
	label: string;
	/** What breaks, and which part of the wiring that proves. */
	description: string;
	run: () => void | Promise<void>;
}

const ErrorTriggers = () => {
	const { notify } = useToast();
	const write = useWrite();
	const [exploding, setExploding] = useState(false);

	// Rendered rather than thrown from the handler: React only catches what goes
	// wrong during rendering, so this is the one path that reaches the boundary.
	if (exploding) return <Boom />;

	const frontend: Trigger[] = [
		{
			id: 'render',
			label: 'Render error',
			description:
				'Throws while rendering. ErrorBoundary catches it and reports the component stack — so the whole app is replaced by "Something broke" until you reload. That is the test working.',
			run: () => setExploding(true),
		},
		{
			id: 'event',
			label: 'Event handler error',
			description:
				"Throws inside this click. React does not catch these, so it reaches Sentry's global handler instead of the boundary — a different path, and the one most real bugs take.",
			run: () => {
				throw new Error('Debug: deliberate event handler failure');
			},
		},
		{
			id: 'rejection',
			label: 'Unhandled rejection',
			description:
				'Rejects a promise nothing is awaiting. Caught by the unhandledrejection listener, which is how a forgotten await shows up in the wild.',
			run: () => {
				void Promise.reject(new Error('Debug: deliberate unhandled rejection'));
			},
		},
		{
			id: 'write',
			label: 'Rejected Firestore write',
			description:
				'Writes to a path the rules deny, through the same useWrite every mutation uses. You get the toast a player would; Sentry gets the reason. Nothing is written — the rules refuse it.',
			run: async () => {
				await write(
					// A collection no rule matches, so the catch-all denies it. Not
					// a real one written badly: this can never half-succeed.
					() => setDoc(doc(getDb(), 'debugDeliberatelyDenied', 'trigger'), { at: Date.now() }),
					'Debug: deliberate write failure'
				);
			},
		},
	];

	const backend: { kind: BackendErrorKind; label: string; description: string }[] = [
		{
			kind: 'throw',
			label: 'Unhandled throw',
			description:
				'Throws out of the callable. instrument reports it and rethrows, so the call fails with "internal" — Firebase hides the real message from the client on purpose. Sentry gets the whole thing.',
		},
		{
			kind: 'httpsError',
			label: 'HttpsError (should NOT report)',
			description:
				'Throws the kind of error the auth checks throw. This one must NOT appear in Sentry — if it does, the filter is broken and the inbox will fill with the rules working correctly.',
		},
		{
			kind: 'swallowed',
			label: 'Swallowed failure',
			description:
				'Reports through reportError and then returns success, exactly as the hourly sweeps do. The call succeeds and Sentry still gets an issue — the failure nothing else would have surfaced.',
		},
	];

	const fireBackend = async (kind: BackendErrorKind) => {
		try {
			await throwTestError(kind);
			notify('Call succeeded — check Sentry for the reported failure.');
		} catch (error) {
			// Expected for two of the three, so this is a result rather than a
			// problem. Reported plainly instead of as a failure, or the screen
			// would look broken while working exactly as intended.
			const message = error instanceof Error ? error.message : String(error);

			notify(kind === 'httpsError' ? `Rejected: ${message}` : 'Call failed as intended — now check Sentry.');
		}
	};

	return (
		<section className='glass rounded-2xl p-5'>
			<div className='mb-1 flex items-center gap-2'>
				<BugAntIcon className='text-muted size-5' aria-hidden='true' />
				<h2 className='text-ink font-semibold'>Break something on purpose</h2>
			</div>

			<p className='text-muted mb-4 text-sm leading-relaxed'>
				Each of these fails a different way, on purpose, so you can watch it arrive in Sentry. Nothing here
				changes a game, a rating or anybody&apos;s data.
			</p>

			<h3 className='text-faint mb-1 text-xs font-semibold tracking-wider uppercase'>In this browser</h3>

			<div className='divide-y divide-white/5 border-t border-white/5'>
				{frontend.map(trigger => (
					<div key={trigger.id} className='flex flex-wrap items-center gap-3 py-4'>
						<div className='min-w-40 flex-1'>
							<p className='text-ink text-sm font-medium'>{trigger.label}</p>
							<p className='text-faint mt-0.5 text-xs leading-relaxed'>{trigger.description}</p>
						</div>

						<Button size='sm' variant='secondary' onClick={() => void trigger.run()}>
							Break it
						</Button>
					</div>
				))}
			</div>

			<h3 className='text-faint mt-6 mb-1 text-xs font-semibold tracking-wider uppercase'>In the functions</h3>

			<div className='divide-y divide-white/5 border-t border-white/5'>
				{backend.map(trigger => (
					<div key={trigger.kind} className='flex flex-wrap items-center gap-3 py-4'>
						<div className='min-w-40 flex-1'>
							<p className='text-ink text-sm font-medium'>{trigger.label}</p>
							<p className='text-faint mt-0.5 text-xs leading-relaxed'>{trigger.description}</p>
						</div>

						<Button size='sm' variant='secondary' onClick={() => void fireBackend(trigger.kind)}>
							Break it
						</Button>
					</div>
				))}
			</div>

			<p className='text-faint mt-5 text-xs leading-relaxed'>
				Nothing is reported when the DSN is unset, and nothing is ever reported from a{' '}
				<code>pnpm dev:seeded</code> run — the emulator check comes first. These only prove anything against a
				deployed build.
			</p>
		</section>
	);
};

export default ErrorTriggers;
