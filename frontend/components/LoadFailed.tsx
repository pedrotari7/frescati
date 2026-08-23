'use client';

import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import Button from './Button';

/**
 * What a screen draws when the listener behind it failed.
 *
 * Deliberately not an `EmptyState`, because the two are the states this app was
 * confusing. A subscription that errors settles into "not loading, no data",
 * which is the same shape as a season with no games in it, so a dropped
 * connection, an expired session or a rule that said no all came up as
 * "Season not found. It may have been deleted, or the link is wrong." That
 * names a cause that didn't happen, on a screen with nothing left to press.
 *
 * `what` completes "Couldn't load ___", so it is the thing in the user's words:
 * "this season", "the teams", never the collection it came out of.
 */
const LoadFailed = ({ what, onRetry }: { what: string; onRetry?: () => void }) => (
	<div className='animate-fade-in flex flex-col items-center justify-center px-6 py-16 text-center'>
		<ExclamationTriangleIcon className='text-pending mb-4 size-12' aria-hidden='true' />

		<p className='text-ink text-base font-semibold'>Couldn&apos;t load {what}</p>
		<p className='text-muted mt-2 max-w-xs text-sm leading-relaxed'>
			That is usually the connection rather than anything you did. Nothing has been lost.
		</p>

		{onRetry && (
			<Button variant='secondary' className='mt-6' onClick={onRetry}>
				<ArrowPathIcon className='size-4' aria-hidden='true' />
				Try again
			</Button>
		)}
	</div>
);

export default LoadFailed;
