import type { DeviceDescription } from '@shared/device';
import { describeUserAgent } from '@shared/device';

/**
 * The browser-side half of `shared/device.ts`.
 *
 * Everything here reads `window` or `navigator`, which is why it can't live in
 * `shared/`, the same parsing runs on the backend over stored user agents,
 * where neither exists. What it adds is the two things only a live browser
 * knows: whether the app is running installed, and whether an iPad is an iPad.
 */

/**
 * Whether the app is running as an installed app rather than in a browser tab.
 *
 * Two checks because Safari never implemented the standard one: `display-mode`
 * is the spec, `navigator.standalone` is the non-standard property iOS has had
 * since 2008, and iOS is the platform where this actually decides whether push
 * works at all.
 */
export const isStandalone = (): boolean =>
	typeof window !== 'undefined' &&
	(window.matchMedia('(display-mode: standalone)').matches ||
		(window.navigator as { standalone?: boolean }).standalone === true);

/**
 * Whether the app is on screen right now.
 *
 * The one signal that separates somebody using Frescati from somebody who
 * merely has it open: a suspended installed app and a tab behind forty others
 * both report `hidden`, and neither is a visit. See `shared/visit.ts` for why
 * that distinction is the whole of the last-seen stamp.
 */
export const isVisible = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'visible';

/**
 * iPadOS 13 dropped `iPad` from the user agent and reports itself as a Mac, so
 * the string alone can't tell them apart. A touch-capable "Macintosh" is an
 * iPad: real Macs report zero touch points, including the ones with a Touch Bar.
 *
 * Worth the extra check rather than leaving it to the shared parser, because
 * this decides whether push is offered at all, an iPad in a Safari tab cannot
 * receive a notification, and a toggle that silently does nothing is worse than
 * being told to add the app to the home screen.
 */
export const isIos = (): boolean =>
	/iPad|iPhone|iPod/.test(navigator.userAgent) ||
	(/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/**
 * Chrome, Firefox and Edge on iOS are all WebKit and all report `Safari` in
 * their user agent too, so Safari itself has to be identified by the absence of
 * the other browsers' markers rather than the presence of its own.
 */
export const isIosSafari = (): boolean => isIos() && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

/** What this device is, in the same terms the admin screen shows. */
export const thisDevice = (): DeviceDescription => {
	const described = describeUserAgent(navigator.userAgent);

	// The parser has no way to spot an iPadOS 13+ tablet; this does.
	return described.platform === 'desktop' && isIos() ? { ...described, platform: 'ios' } : described;
};
