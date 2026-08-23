'use client';

import { useCallback } from 'react';
import { useToast } from '../components/Toast';
import { captureError } from '../lib/sentry';

/**
 * Runs a Firestore write and says so when it fails.
 *
 * Almost every mutation in this app is a row action firing straight at
 * Firestore with nothing awaiting it, so a rejected write: an expired session,
 * a rule that says no, a flaky connection, produced an unhandled rejection in
 * the console and absolutely nothing on screen. The button just didn't work.
 *
 * Returns whether it succeeded, so callers that show their own confirmation
 * only show it when there is something to confirm.
 */
export const useWrite = () => {
	const { warn } = useToast();

	return useCallback(
		async (action: () => Promise<unknown>, failureMessage: string): Promise<boolean> => {
			try {
				await action();

				return true;
			} catch (error) {
				console.error(failureMessage, error);
				warn(failureMessage);

				// Every mutation in the app funnels through here, so this is the
				// one place a rejected write can be seen from. The toast tells
				// the player; without this nothing tells us, and "a rule says no
				// to something the UI offered" is a bug every time.
				void captureError(error, { failureMessage });

				return false;
			}
		},
		[warn]
	);
};
