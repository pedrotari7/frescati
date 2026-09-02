'use client';

import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { BugAntIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { BackendErrorKind } from '@shared/debug';
import { getDb } from '../lib/firebaseClient';
import { throwTestError } from '../lib/db/testError';
import { useWrite } from '../hooks/useWrite';
import { useToast } from '../components/Toast';
import Button from './Button';
import { colors, fonts, tint } from '../app/tokens.stylex';
import { surfaces, text } from '../lib/styles';

const styles = stylex.create({
	card: { borderRadius: 16, padding: 20 },
	head: { marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 },
	headIcon: { color: colors.muted, width: 20, height: 20 },
	title: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	blurb: { color: colors.muted, marginBottom: 16, fontSize: 14, lineHeight: 1.625 },
	/* A script name in the middle of a sentence. `1em` because the browser draws
	   its own `<code>` a size smaller than whatever it sits in, and there is no
	   preflight rule putting that back any more. */
	code: { fontFamily: fonts.mono, fontSize: '1em' },

	heading: { marginBottom: 4 },
	headingLater: { marginTop: 24, marginBottom: 4 },

	/* A rule above every row, the first one included, which is what
	   `divide-y` plus a `border-t` on the container came to. */
	row: {
		borderTopWidth: 1,
		borderTopStyle: 'solid',
		borderTopColor: tint.white5,
		display: 'flex',
		flexWrap: 'wrap',
		alignItems: 'center',
		gap: 12,
		paddingBlock: 16,
	},
	rowBody: { minWidth: 160, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	label: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 500 },
	description: { color: colors.faint, marginTop: 2, fontSize: 12, lineHeight: 1.625 },

	footnote: { color: colors.faint, marginTop: 20, fontSize: 12, lineHeight: 1.625 },
});

/**
 * Breaks things on purpose, so error reporting can be proved rather than hoped
 * for.
 *
 * A reporting pipeline looks identical working and broken. A typo'd DSN, a
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
				'Throws while rendering. ErrorBoundary catches it, reports the component stack, waits for that to leave, and then reloads the page itself. Most of what lands there is a chunk that never arrived. The reload is the test working. Press it twice in a row and the second one stops and shows "Something broke" instead.',
			run: () => setExploding(true),
		},
		{
			id: 'event',
			label: 'Event handler error',
			description:
				"Throws inside this click. React does not catch these, so it reaches Sentry's global handler instead of the boundary, a different path, and the one most real bugs take.",
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
				'Writes to a path the rules deny, through the same useWrite every mutation uses. You get the toast a player would; Sentry gets the reason. Nothing is written, the rules refuse it.',
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
				'Throws out of the callable. instrument reports it and rethrows, so the call fails with "internal". Firebase hides the real message from the client on purpose. Sentry gets the whole thing.',
		},
		{
			kind: 'httpsError',
			label: 'HttpsError (should NOT report)',
			description:
				'Throws the kind of error the auth checks throw. This one must NOT appear in Sentry. If it does, the filter is broken and the inbox will fill with the rules working correctly.',
		},
		{
			kind: 'swallowed',
			label: 'Swallowed failure',
			description:
				'Reports through reportError and then returns success, exactly as the hourly sweeps do. The call succeeds and Sentry still gets an issue, the failure nothing else would have surfaced.',
		},
	];

	const fireBackend = async (kind: BackendErrorKind) => {
		try {
			await throwTestError(kind);
			notify('Call succeeded. Check Sentry for the reported failure.');
		} catch (error) {
			// Expected for two of the three, so this is a result rather than a
			// problem. Reported plainly instead of as a failure, or the screen
			// would look broken while working exactly as intended.
			const message = error instanceof Error ? error.message : String(error);

			notify(kind === 'httpsError' ? `Rejected: ${message}` : 'Call failed as intended. Now check Sentry.');
		}
	};

	return (
		<section {...stylex.props(surfaces.glass, styles.card)}>
			<div {...stylex.props(styles.head)}>
				<BugAntIcon {...stylex.props(styles.headIcon)} aria-hidden='true' />
				<h2 {...stylex.props(styles.title)}>Break something on purpose</h2>
			</div>

			<p {...stylex.props(styles.blurb)}>
				Each of these fails a different way, on purpose, so you can watch it arrive in Sentry. Nothing here
				changes a game, a rating or anybody&apos;s data.
			</p>

			<h3 {...stylex.props(text.sectionHeading, styles.heading)}>In this browser</h3>

			<div>
				{frontend.map(trigger => (
					<div key={trigger.id} {...stylex.props(styles.row)}>
						<div {...stylex.props(styles.rowBody)}>
							<p {...stylex.props(styles.label)}>{trigger.label}</p>
							<p {...stylex.props(styles.description)}>{trigger.description}</p>
						</div>

						<Button size='sm' variant='secondary' onClick={() => void trigger.run()}>
							Break it
						</Button>
					</div>
				))}
			</div>

			<h3 {...stylex.props(text.sectionHeading, styles.headingLater)}>In the functions</h3>

			<div>
				{backend.map(trigger => (
					<div key={trigger.kind} {...stylex.props(styles.row)}>
						<div {...stylex.props(styles.rowBody)}>
							<p {...stylex.props(styles.label)}>{trigger.label}</p>
							<p {...stylex.props(styles.description)}>{trigger.description}</p>
						</div>

						<Button size='sm' variant='secondary' onClick={() => void fireBackend(trigger.kind)}>
							Break it
						</Button>
					</div>
				))}
			</div>

			<p {...stylex.props(styles.footnote)}>
				Nothing is reported when the DSN is unset, and nothing at all is reported from a local run,{' '}
				<code {...stylex.props(styles.code)}>dev:seeded</code> and{' '}
				<code {...stylex.props(styles.code)}>dev:live</code> alike, since only a build Vercel made reports.
				These only prove anything against a deployed build.
			</p>
		</section>
	);
};

export default ErrorTriggers;
