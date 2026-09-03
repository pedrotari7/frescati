'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { getCalendarLink, rotateCalendarToken } from '../lib/db/calendar';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { useWrite } from '../hooks/useWrite';
import { captureError } from '../lib/sentry';
import Button from './Button';
import Spinner from './Spinner';
import { CONTROL } from './Field';
import { bp, colors, fonts, tint } from '../app/tokens.stylex';
import { animations, elevation, surfaces, utils } from '../lib/styles';

const styles = stylex.create({
	dialog: { position: 'relative', zIndex: 50 },
	scrim: {
		backgroundColor: tint.canvas80,
		position: 'fixed',
		inset: 0,
		backdropFilter: 'blur(4px)',
		WebkitBackdropFilter: 'blur(4px)',
	},
	positioner: {
		position: 'fixed',
		inset: 0,
		display: 'flex',
		alignItems: { default: 'flex-end', [bp.sm]: 'center' },
		justifyContent: 'center',
		padding: 16,
	},
	panel: { width: '100%', maxWidth: 384, borderRadius: 24, padding: 20 },
	title: { color: colors.ink, fontSize: 18, lineHeight: '28px', fontWeight: 600 },
	blurb: { color: colors.muted, marginTop: 8, fontSize: 14, lineHeight: 1.625 },
	failed: { color: colors.out, marginTop: 16, fontSize: 14, lineHeight: '20px' },

	loading: { marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, lineHeight: '20px' },
	spinner: { width: 16, height: 16 },
	loadingLabel: { color: colors.faint },

	link: { marginTop: 16, fontFamily: fonts.mono, fontSize: 12, lineHeight: '16px' },
	actions: { marginTop: 12, display: 'flex', gap: 12 },
	subscribe: {
		color: colors.ink,
		display: 'inline-flex',
		height: 44,
		width: '100%',
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 12,
		fontSize: 14,
		lineHeight: '20px',
		transitionDuration: '0.15s',
		transform: { default: null, ':active': 'scale(0.98)' },
	},

	rotate: {
		color: { default: colors.faint, [bp.hover]: { default: null, ':hover': colors.ink } },
		marginTop: 16,
		display: 'flex',
		alignItems: 'center',
		gap: 6,
		fontSize: 12,
		lineHeight: '16px',
	},
	rotateIcon: { width: 14, height: 14 },
	close: { marginTop: 16 },
});

/**
 * Lets somebody subscribe to a season's games from their own calendar app.
 *
 * One link per season, shared by everyone who asks for it: see
 * `frontend/lib/db/calendar.ts`. Fetched fresh every time this opens rather
 * than cached anywhere on the client, since a season admin rotating it from
 * another tab should never leave somebody copying a dead link.
 */
const CalendarSubscribeSheet = ({
	seasonId,
	open,
	onClose,
	canRotate = false,
}: {
	seasonId: string;
	open: boolean;
	onClose: () => void;
	canRotate?: boolean;
}) => {
	const [url, setUrl] = useState<string | null>(null);
	const [loadFailed, setLoadFailed] = useState(false);
	const { notify } = useToast();
	const confirm = useConfirm();
	const write = useWrite();

	useEffect(() => {
		if (!open) return;

		setUrl(null);
		setLoadFailed(false);

		getCalendarLink(seasonId)
			.then(setUrl)
			.catch(error => {
				setLoadFailed(true);
				void captureError(error, { stage: 'getCalendarLink' });
			});
	}, [open, seasonId]);

	const copy = async () => {
		if (!url) return;

		// `write` isn't just for Firestore: it's the one place in the app that
		// already catches a failed async action, toasts it, and reports it, which
		// a rejected `clipboard.writeText` (permission denied, insecure context,
		// an older WebView) needs exactly as much as a rejected write does. Copy
		// is this dialog's primary action, so failing silently would leave
		// someone with no way to get a working link at all.
		const ok = await write(() => navigator.clipboard.writeText(url), "Couldn't copy the link.");
		if (ok) notify('Link copied');
	};

	const rotate = async () => {
		const ok = await confirm({
			title: 'Rotate this link?',
			message:
				"Everyone who's already subscribed stops getting updates, they'd need the new link to resubscribe.",
			confirmLabel: 'Rotate link',
			tone: 'danger',
		});
		if (!ok) return;

		await write(async () => setUrl(await rotateCalendarToken(seasonId)), "Couldn't rotate the calendar link.");
	};

	// iOS and macOS open Calendar directly on a `webcal://` link and offer to
	// subscribe; everything else just treats it as a slightly unusual URL, which
	// is why "Copy link", for pasting into "Add calendar by URL", is the
	// primary action rather than this.
	const webcalUrl = url?.replace(/^https?:\/\//, 'webcal://');

	return (
		<Dialog open={open} onClose={onClose} {...stylex.props(styles.dialog)}>
			<div {...stylex.props(styles.scrim)} aria-hidden='true' />

			<div {...stylex.props(styles.positioner)}>
				<DialogPanel
					{...stylex.props(surfaces.glass, elevation.lift, animations.rise, utils.mbSafe, styles.panel)}
				>
					<DialogTitle {...stylex.props(styles.title)}>Subscribe to this season</DialogTitle>

					<p {...stylex.props(styles.blurb)}>
						Add this to your phone or laptop&apos;s calendar and it keeps itself up to date: kickoff times,
						venue changes and cancellations all show up without reopening the app. Most calendar apps only
						re-check a subscribed link every several hours, so a change here won&apos;t appear instantly.
					</p>

					{loadFailed && (
						<p {...stylex.props(styles.failed)}>Couldn&apos;t get a link. Try again in a moment.</p>
					)}

					{!url && !loadFailed && (
						<div {...stylex.props(styles.loading)}>
							<Spinner sx={styles.spinner} />
							<span {...stylex.props(styles.loadingLabel)}>Getting your link…</span>
						</div>
					)}

					{url && (
						<>
							<input
								readOnly
								value={url}
								onFocus={e => e.currentTarget.select()}
								aria-label='Calendar subscription link'
								{...stylex.props(CONTROL, styles.link)}
							/>

							<div {...stylex.props(styles.actions)}>
								<Button variant='primary' fullWidth onClick={copy}>
									Copy link
								</Button>
								{/* A plain `<a>`, not a `Button`, `webcal://` needs real
								    navigation, and an anchor nested inside a `<button>`
								    is invalid HTML that browsers handle inconsistently. */}
								<a href={webcalUrl} {...stylex.props(surfaces.glassCard, styles.subscribe)}>
									Subscribe
								</a>
							</div>

							{canRotate && (
								<button type='button' onClick={rotate} {...stylex.props(styles.rotate)}>
									<ArrowPathIcon {...stylex.props(styles.rotateIcon)} aria-hidden='true' />
									Rotate link, invalidates every copy already out there
								</button>
							)}
						</>
					)}

					<Button variant='ghost' fullWidth onClick={onClose} sx={styles.close}>
						Close
					</Button>
				</DialogPanel>
			</div>
		</Dialog>
	);
};

export default CalendarSubscribeSheet;
