'use client';

import { useEffect, useState } from 'react';
import { ArrowUpOnSquareIcon, XMarkIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { isIos, isIosSafari, isStandalone } from '../lib/device';
import { BottomSlot } from './BottomStack';
import Button from './Button';
import { bp, colors, tint } from '../app/tokens.stylex';
import { animations, elevation } from '../lib/styles';

const DISMISS_KEY = 'frescati:install-dismissed';

const styles = stylex.create({
	/*
	 * Opaque enough to read over, because this floats above whatever the page
	 * was showing rather than over a fixed backdrop. Same reason the bottom nav
	 * uses `surfaces.glassNav` instead of the 4.5% tint.
	 */
	card: {
		backgroundColor: tint.raised95,
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: tint.line60,
		backdropFilter: 'blur(24px)',
		WebkitBackdropFilter: 'blur(24px)',
		marginInline: 'auto',
		display: 'flex',
		maxWidth: 448,
		alignItems: 'flex-start',
		gap: 12,
		borderRadius: 16,
		padding: 16,
	},
	badge: {
		backgroundColor: tint.brand15,
		display: 'flex',
		width: 40,
		height: 40,
		flexShrink: 0,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 12,
		fontSize: 20,
		lineHeight: '28px',
	},

	body: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	title: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	blurb: { color: colors.muted, marginTop: 2, fontSize: 12, lineHeight: '16px' },
	/* The share glyph sits in the sentence, so the line has to wrap around it. */
	steps: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
	shareIcon: { display: 'inline', width: 16, height: 16 },
	strong: { color: colors.ink, fontWeight: 500 },
	install: { marginTop: 12 },

	/* Pulled into the card's padding so the cross sits in the corner rather
	   than a quarter of an inch inside it. */
	dismiss: {
		color: { default: colors.faint, [bp.hover]: { default: null, ':hover': colors.ink } },
		marginTop: -4,
		marginRight: -4,
		display: 'flex',
		width: 32,
		height: 32,
		flexShrink: 0,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 9999,
		borderWidth: 0,
		backgroundColor: 'transparent',
	},
	dismissIcon: { width: 20, height: 20 },
});

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Nudges people to install, because the installed app is where push actually
 * works, on iOS, notifications are only available once it's on the home
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

		// Safari never fires that event, so show the manual hint instead, but
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
		<BottomSlot order={2}>
			<div {...stylex.props(elevation.glass, animations.rise, styles.card)}>
				<div {...stylex.props(styles.badge)}>⚽</div>

				<div {...stylex.props(styles.body)}>
					<p {...stylex.props(styles.title)}>Add Frescati to your home screen</p>

					{deferred ? (
						<p {...stylex.props(styles.blurb)}>Opens instantly and can send you reminders.</p>
					) : isSafari ? (
						<p {...stylex.props(styles.blurb, styles.steps)}>
							Tap
							<ArrowUpOnSquareIcon {...stylex.props(styles.shareIcon)} aria-hidden='true' />
							Share, then &ldquo;Add to Home Screen&rdquo;. Needed for reminders on iPhone.
						</p>
					) : (
						<p {...stylex.props(styles.blurb)}>
							Open this page in <span {...stylex.props(styles.strong)}>Safari</span> first, iPhone only
							installs home screen apps from Safari, not this browser.
						</p>
					)}

					{deferred && (
						<Button size='sm' variant='primary' sx={styles.install} onClick={install}>
							Install
						</Button>
					)}
				</div>

				<button type='button' onClick={dismiss} aria-label='Dismiss' {...stylex.props(styles.dismiss)}>
					<XMarkIcon {...stylex.props(styles.dismissIcon)} />
				</button>
			</div>
		</BottomSlot>
	);
};

export default PwaInstallPrompt;
