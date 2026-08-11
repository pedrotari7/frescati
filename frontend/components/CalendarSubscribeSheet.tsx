'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { getCalendarLink, rotateCalendarToken } from '../lib/db/calendar';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { useWrite } from '../hooks/useWrite';
import Button from './Button';
import Spinner from './Spinner';
import { CONTROL } from './Field';

/**
 * Lets somebody subscribe to a season's games from their own calendar app.
 *
 * One link per season, shared by everyone who asks for it — see
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
			.catch(() => setLoadFailed(true));
	}, [open, seasonId]);

	const copy = async () => {
		if (!url) return;

		// `write` isn't just for Firestore — it's the one place in the app that
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
			message: "Everyone who's already subscribed stops getting updates — they'd need the new link to resubscribe.",
			confirmLabel: 'Rotate link',
			tone: 'danger',
		});
		if (!ok) return;

		await write(async () => setUrl(await rotateCalendarToken(seasonId)), "Couldn't rotate the calendar link.");
	};

	// iOS and macOS open Calendar directly on a `webcal://` link and offer to
	// subscribe; everything else just treats it as a slightly unusual URL, which
	// is why "Copy link" — for pasting into "Add calendar by URL" — is the
	// primary action rather than this.
	const webcalUrl = url?.replace(/^https?:\/\//, 'webcal://');

	return (
		<Dialog open={open} onClose={onClose} className='relative z-50'>
			<div className='bg-canvas/80 fixed inset-0 backdrop-blur-sm' aria-hidden='true' />

			<div className='fixed inset-0 flex items-end justify-center p-4 sm:items-center'>
				<DialogPanel className='glass shadow-lift animate-rise mb-safe w-full max-w-sm rounded-3xl p-5'>
					<DialogTitle className='text-ink text-lg font-semibold'>Subscribe to this season</DialogTitle>

					<p className='text-muted mt-2 text-sm leading-relaxed'>
						Add this to your phone or laptop&apos;s calendar and it keeps itself up to date — kickoff
						times, venue changes and cancellations all show up without reopening the app. Most calendar
						apps only re-check a subscribed link every several hours, so a change here won&apos;t appear
						instantly.
					</p>

					{loadFailed && (
						<p className='text-out mt-4 text-sm'>Couldn&apos;t get a link. Try again in a moment.</p>
					)}

					{!url && !loadFailed && (
						<div className='mt-4 flex items-center gap-2 text-sm'>
							<Spinner className='size-4' />
							<span className='text-faint'>Getting your link…</span>
						</div>
					)}

					{url && (
						<>
							<input
								readOnly
								value={url}
								onFocus={e => e.currentTarget.select()}
								aria-label='Calendar subscription link'
								className={`${CONTROL} mt-4 font-mono text-xs`}
							/>

							<div className='mt-3 flex gap-3'>
								<Button variant='primary' fullWidth onClick={copy}>
									Copy link
								</Button>
								{/* A plain `<a>`, not a `Button` — `webcal://` needs real
								    navigation, and an anchor nested inside a `<button>`
								    is invalid HTML that browsers handle inconsistently. */}
								<a
									href={webcalUrl}
									className='glass-card text-ink hover:text-ink inline-flex h-11 w-full items-center justify-center rounded-xl text-sm transition-all duration-150 active:scale-[0.98]'
								>
									Subscribe
								</a>
							</div>

							{canRotate && (
								<button
									type='button'
									onClick={rotate}
									className='text-faint hover:text-ink mt-4 flex items-center gap-1.5 text-xs'
								>
									<ArrowPathIcon className='size-3.5' aria-hidden='true' />
									Rotate link — invalidates every copy already out there
								</button>
							)}
						</>
					)}

					<Button variant='ghost' fullWidth onClick={onClose} className='mt-4'>
						Close
					</Button>
				</DialogPanel>
			</div>
		</Dialog>
	);
};

export default CalendarSubscribeSheet;
