'use client';

import Link from 'next/link';
import { ArrowPathIcon, BellAlertIcon } from '@heroicons/react/24/outline';
import type { AppUser } from '@shared/types';
import { byDisplayName } from '@shared/format';
import { personRow } from '../lib/people';
import Avatar from './Avatar';
import Button from './Button';
import { SkeletonBlock } from './Skeleton';

/**
 * Who has the bell on for this game, for an app admin.
 *
 * `availability` is the one notification whose audience isn't already on the
 * screen. Every other kind goes somewhere an admin can see — the roster, the
 * people who answered, the other admins — so the only one they have to be told
 * about is the one nobody signed up for in public. This is the answer to "who
 * hears about it if I move kick-off", asked a moment before doing exactly that.
 *
 * Drawn alongside the bell rather than on `/admin/notifications`, which is a
 * per-person screen about the app as a whole: this is per game, and the game is
 * where the question is asked. It appears and disappears with the bell for the
 * same reason the bell has an `isWatchable` behind it — on a cancelled or a
 * finished game nothing will be sent, so a list of who'd hear it would be
 * describing notifications that aren't coming.
 */
const GameWatchers = ({
	uids,
	usersByUid,
	loading,
	error,
	onReload,
}: {
	uids: string[];
	usersByUid: Map<string, AppUser>;
	loading: boolean;
	error: Error | null;
	onReload: () => void;
}) => {
	// By name, not by when they followed. The question is who, and the order
	// people happened to tap the bell in is not something anybody is looking for.
	const watchers = uids.map(uid => personRow(usersByUid, uid)).sort(byDisplayName);

	return (
		<section className='glass rounded-2xl p-4'>
			<div className='flex items-start justify-between gap-2'>
				<div className='flex min-w-0 items-center gap-2'>
					<BellAlertIcon className='text-brand size-4 shrink-0' aria-hidden='true' />
					<h2 className='text-ink text-sm font-semibold'>
						Following this game
						{!loading && !error && <span className='text-faint font-normal'> ({watchers.length})</span>}
					</h2>
				</div>

				{/* Realtime everywhere else, so the one card that isn't says so
				    rather than quietly going stale — same bargain as the admin
				    notifications screen, and for the same reason: the rule that
				    keeps this private is what rules out a listener. */}
				<Button size='sm' variant='secondary' onClick={onReload} disabled={loading}>
					<ArrowPathIcon className='size-4' aria-hidden='true' />
					Refresh
				</Button>
			</div>

			{loading ? (
				<SkeletonBlock className='mt-3 h-8' />
			) : error ? (
				<p className='text-out mt-3 text-sm leading-relaxed'>Couldn&apos;t load who is following this game.</p>
			) : watchers.length === 0 ? (
				<p className='text-faint mt-3 text-sm'>Nobody has turned notifications on for this game.</p>
			) : (
				<ul className='mt-3 flex flex-wrap gap-2'>
					{watchers.map(watcher => (
						<li key={watcher.uid}>
							<Link
								href={`/u/${watcher.uid}`}
								className='flex items-center gap-2 rounded-full bg-white/5 py-1 pr-3 pl-1 transition-colors hover:bg-white/10'
							>
								<Avatar displayName={watcher.displayName} photoURL={watcher.photoURL} size='sm' />
								<span className='text-ink max-w-40 truncate text-sm'>{watcher.displayName}</span>
							</Link>
						</li>
					))}
				</ul>
			)}

			{/* Following is necessary, not sufficient — the availability push
			    still needs a registered device or an address to fall back to, and
			    that is a different screen's question. Only worth saying when
			    there is somebody it could be true of. */}
			{!loading && !error && watchers.length > 0 && (
				<p className='text-faint mt-3 text-xs leading-relaxed'>
					They hear whenever somebody&apos;s answer moves — if the app can reach them at all. Check{' '}
					<Link href='/admin/notifications' className='text-muted underline underline-offset-2'>
						Notifications
					</Link>{' '}
					for who it can&apos;t.
				</p>
			)}
		</section>
	);
};

export default GameWatchers;
