'use client';

import { useEffect, useRef } from 'react';
import type { ResponseStatus } from '@shared/types';
import { useToast } from '../components/Toast';
import { captureError } from '../lib/sentry';

const isResponseStatus = (value: string | null): value is ResponseStatus => value === 'in' || value === 'out';

/**
 * Answers on behalf of someone who tapped "I'm in" on a notification.
 *
 * The service worker can't write the response itself: it holds no auth token,
 * so it appends `?respond=in` and opens the app, and this performs the write
 * once the season has loaded and the role is known.
 *
 * The parameter is stripped before the write is attempted, not after: leaving it
 * in place would re-answer on every refresh, and the back button would too.
 *
 * Read straight off `window.location` rather than through `useSearchParams`.
 * This is a one-shot side effect, not something the render depends on, and it
 * keeps the page out of the Suspense boundary that hook would require.
 */
export const useRespondIntent = ({
	ready,
	isOpen,
	pendingSpot = false,
	blockedByDebt = false,
	onRespond,
}: {
	/** Season and game have loaded, so the role behind the write is the real one. */
	ready: boolean;
	/** The game is still accepting answers. */
	isOpen: boolean;
	/**
	 * Whether an In here lands as an extra still waiting on an admin's nod.
	 *
	 * Worked out by the caller, which holds both halves of it: the role this
	 * write is recorded under and whether an admin has already waved this person
	 * through on this game. "See you there" is the one thing the app must not
	 * say to somebody who is not in the headcount yet, least of all seconds
	 * before the screen behind the toast tells them they are waiting.
	 */
	pendingSpot?: boolean;
	/**
	 * Whether this player owes the season money, which refuses an In.
	 *
	 * The notification's buttons were sent before the charge existed and the
	 * service worker cannot know, so the tap arrives here regardless. Checked
	 * rather than left to the rule: a refused write would reach somebody as
	 * "couldn't save your answer, try again", which is wrong about what happened
	 * and wrong about what to do, and it would report a rule doing its job to
	 * Sentry as an application error.
	 */
	blockedByDebt?: boolean;
	onRespond: (status: ResponseStatus) => Promise<void>;
}) => {
	const { notify, warn } = useToast();
	const handled = useRef(false);

	useEffect(() => {
		if (handled.current || !ready) return;

		const intent = new URLSearchParams(window.location.search).get('respond');
		if (!isResponseStatus(intent)) return;

		handled.current = true;
		window.history.replaceState(null, '', window.location.pathname);

		if (!isOpen) {
			warn('Answers for this game have already closed.');
			return;
		}

		// Only the In, for the reason the button beside it is only half disabled.
		// An Out from this notification is the answer somebody who owes money is
		// most likely to be giving, and the one the organiser most needs.
		if (blockedByDebt && intent === 'in') {
			warn('You owe this season money. Settle up on the finances page to sign up again.');
			return;
		}

		onRespond(intent)
			.then(() =>
				notify(
					intent === 'out'
						? "Thanks, you're marked as out."
						: pendingSpot
							? "Thanks. An admin has to confirm your spot before you're in."
							: "You're in. See you there."
				)
			)
			.catch(error => {
				console.error('Could not save the response from a notification', error);
				warn("Couldn't save your answer. Open the game and try again.");
				void captureError(error, { stage: 'respondIntent' });
			});
	}, [ready, isOpen, pendingSpot, blockedByDebt, onRespond, notify, warn]);
};
