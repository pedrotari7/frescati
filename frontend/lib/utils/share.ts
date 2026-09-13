import type { GameShare } from '@shared/share';
import { shareToText } from '@shared/share';

/**
 * What a share actually did, because the three outcomes need three different
 * things said about them and only one of them is a failure.
 *
 * `dismissed` is the one worth naming. Opening the system sheet and changing
 * your mind rejects the same promise a real failure does, and treating that as
 * an error put "Couldn't share" in front of somebody who had just tapped
 * Cancel.
 */
export type ShareOutcome = 'shared' | 'copied' | 'dismissed';

/**
 * Hand a game to the share sheet, or to the clipboard where there isn't one.
 *
 * The clipboard is the fallback rather than the other way round because the
 * whole point is to get this into a chat the app has no reach into, and on a
 * phone, which is where everybody reads that chat, the sheet posts it in two
 * taps. A desktop browser with no `navigator.share` gets the same text to paste.
 *
 * Real failures are thrown rather than swallowed, so the caller's `useWrite`
 * can say so and report it. A browser that has neither of these is not a
 * browser this app works in.
 */
export const shareOrCopy = async (share: GameShare): Promise<ShareOutcome> => {
	if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
		try {
			await navigator.share(share);

			return 'shared';
		} catch (error) {
			// The only rejection that isn't a fault. Every browser uses
			// `AbortError` for a dismissed sheet, and there is nothing else to
			// go on: the name is the whole signal.
			if (error instanceof DOMException && error.name === 'AbortError') return 'dismissed';

			throw error;
		}
	}

	await navigator.clipboard.writeText(shareToText(share));

	return 'copied';
};
