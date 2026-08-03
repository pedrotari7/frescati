'use client';

import { useEffect, useState } from 'react';
import { ArrowUpOnSquareIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Button from './Button';

const DISMISS_KEY = 'frescati:install-dismissed';

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

// Chrome/Firefox/Edge on iOS all run on WebKit and report "Safari" in their UA
// too, so Safari itself has to be identified by the absence of the other
// browsers' markers, not the presence of its own.
const isIosSafari = () => isIos() && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

const isStandalone = () =>
	window.matchMedia('(display-mode: standalone)').matches ||
	(window.navigator as { standalone?: boolean }).standalone === true;

/**
 * Nudges people to install, because the installed app is where push actually
 * works — on iOS, notifications are only available once it's on the home
 * screen, so this isn't cosmetic.
 *
 * Two paths: Chrome/Android gets the real `beforeinstallprompt` flow, iOS gets
 * instructions, since Safari has no programmatic install.
 */
const PwaInstallPrompt = () => {
	const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
	const [showIosHint, setShowIosHint] = useState(false);
	const [isSafari, setIsSafari] = useState(true);

	useEffect(() => {
		if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return;

		const onBeforeInstall = (event: Event) => {
			event.preventDefault();
			setDeferred(event as BeforeInstallPromptEvent);
		};

		window.addEventListener('beforeinstallprompt', onBeforeInstall);

		// Safari never fires that event, so show the manual hint instead — but
		// not instantly, since a banner on first paint just gets swatted away.
		const timer = isIos()
			? setTimeout(() => {
					setIsSafari(isIosSafari());
					setShowIosHint(true);
				}, 4000)
			: undefined;

		return () => {
			window.removeEventListener('beforeinstallprompt', onBeforeInstall);
			if (timer) clearTimeout(timer);
		};
	}, []);

	const dismiss = () => {
		localStorage.setItem(DISMISS_KEY, '1');
		setDeferred(null);
		setShowIosHint(false);
	};

	const install = async () => {
		if (!deferred) return;

		await deferred.prompt();
		await deferred.userChoice;
		dismiss();
	};

	if (!deferred && !showIosHint) return null;

	return (
		<div className='pb-safe animate-rise fixed inset-x-0 bottom-0 z-40 px-2 pb-20 lg:bottom-4 lg:pb-0'>
			<div className='bg-raised/95 shadow-glass border-line/60 mx-auto flex max-w-md items-start gap-3 rounded-2xl border p-4 backdrop-blur-xl'>
				<div className='bg-brand/15 flex size-10 shrink-0 items-center justify-center rounded-xl text-xl'>
					⚽
				</div>

				<div className='min-w-0 flex-1'>
					<p className='text-ink text-sm font-semibold'>Add Frescati to your home screen</p>

					{deferred ? (
						<p className='text-muted mt-0.5 text-xs'>Opens instantly and can send you reminders.</p>
					) : isSafari ? (
						<p className='text-muted mt-0.5 flex flex-wrap items-center gap-1 text-xs'>
							Tap
							<ArrowUpOnSquareIcon className='inline size-4' aria-hidden='true' />
							Share, then &ldquo;Add to Home Screen&rdquo;. Needed for reminders on iPhone.
						</p>
					) : (
						<p className='text-muted mt-0.5 text-xs'>
							Open this page in <span className='text-ink font-medium'>Safari</span> first — iPhone only
							installs home screen apps from Safari, not this browser.
						</p>
					)}

					{deferred && (
						<Button size='sm' variant='primary' className='mt-3' onClick={install}>
							Install
						</Button>
					)}
				</div>

				<button
					type='button'
					onClick={dismiss}
					aria-label='Dismiss'
					className='text-faint hover:text-ink -mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full'
				>
					<XMarkIcon className='size-5' />
				</button>
			</div>
		</div>
	);
};

export default PwaInstallPrompt;
