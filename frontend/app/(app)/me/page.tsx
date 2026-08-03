'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightStartOnRectangleIcon, BellIcon } from '@heroicons/react/24/outline';
import { signOutOfApp, useAuth } from '../../../lib/auth';
import { checkPushSupport, disablePush, enablePush, isPushEnabled } from '../../../lib/push';
import type { PushSupport } from '../../../lib/push';
import { DEFAULT_NOTIFICATION_PREFS } from '@shared/types';
import { useUser } from '../../../hooks/useData';
import { useWrite } from '../../../hooks/useWrite';
import { setNotificationPrefs } from '../../../lib/db/users';
import Toggle from '../../../components/Toggle';
import { seasonNavItems } from '../../../components/BottomNav';
import { useSeasonScope } from '../../../components/SeasonScope';
import PageShell from '../../../components/PageShell';
import Avatar from '../../../components/Avatar';
import Button from '../../../components/Button';
import StatusPill from '../../../components/StatusPill';

const MePage = () => {
	const router = useRouter();
	const { user } = useAuth();
	const { seasonId } = useSeasonScope();
	const write = useWrite();

	const [support, setSupport] = useState<PushSupport | null>(null);
	// `null` while we're still asking. Reflects whether this device holds a
	// registered token, not whether the browser has granted permission — those
	// diverge the moment somebody turns notifications off.
	const [enabled, setEnabled] = useState<boolean | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const uid = user?.uid;

	// The stored preferences, which apply to the account rather than this
	// device — the backend checks them before sending anything.
	const { user: profile } = useUser(uid ?? null);
	const prefs = profile?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;

	useEffect(() => {
		checkPushSupport().then(setSupport);
	}, []);

	useEffect(() => {
		if (!uid) return;

		let cancelled = false;
		isPushEnabled(uid).then(on => {
			if (!cancelled) setEnabled(on);
		});

		return () => {
			cancelled = true;
		};
	}, [uid]);

	if (!user) return null;

	const handleEnable = async () => {
		setMessage(null);

		const result = await enablePush(user.uid);
		setEnabled(result.ok);
		setMessage(result.ok ? 'Notifications are on for this device.' : (result.reason ?? 'Something went wrong.'));
	};

	const handleDisable = async () => {
		setMessage(null);
		await disablePush(user.uid);
		setEnabled(false);
		setMessage('This device will no longer get notifications.');
	};

	// Me is a tab of the season the user came from, so the bar it was tapped on
	// stays exactly as it was. Opened cold with no season, it's a leaf screen.
	return (
		<PageShell
			title='You'
			navItems={seasonId ? seasonNavItems(seasonId) : undefined}
			backHref={seasonId ? undefined : '/seasons'}
		>
			<div className='space-y-4 p-4'>
				<section className='glass flex items-center gap-4 rounded-2xl p-5'>
					<Avatar displayName={user.displayName} photoURL={user.photoURL} size='lg' />
					<div className='min-w-0'>
						<p className='text-ink truncate font-semibold'>{user.displayName}</p>
						<p className='text-faint truncate text-xs'>{user.email}</p>
						{user.isAppAdmin && (
							<StatusPill tone='brand' className='mt-1.5'>
								App admin
							</StatusPill>
						)}
					</div>
				</section>

				<section className='glass rounded-2xl p-5'>
					<div className='mb-1 flex items-center gap-2'>
						<BellIcon className='text-muted size-5' aria-hidden='true' />
						<h2 className='text-ink font-semibold'>Notifications</h2>
					</div>

					<p className='text-muted mb-4 text-sm leading-relaxed'>
						Get a nudge when it&apos;s time to say whether you&apos;re playing, and a heads-up if a game is
						short or called off.
					</p>

					{support === 'needs-install' && (
						<p className='text-pending mb-4 text-sm'>
							On iPhone, add Frescati to your home screen first — Safari only allows notifications for
							installed apps.
						</p>
					)}

					{support === 'unsupported' && (
						<p className='text-faint mb-4 text-sm'>This browser doesn&apos;t support notifications.</p>
					)}

					{support === 'supported' &&
						enabled !== null &&
						(enabled ? (
							<Button variant='secondary' fullWidth onClick={handleDisable}>
								Turn off on this device
							</Button>
						) : (
							<Button variant='primary' fullWidth onClick={handleEnable}>
								Turn on notifications
							</Button>
						))}

					{message && <p className='text-muted mt-3 text-xs'>{message}</p>}

					{/* Separate from the per-device switch above: these say which
					    kinds you want at all, on every device you've registered. */}
					<div className='mt-4 divide-y divide-white/5 border-t border-white/5 pt-1'>
						<Toggle
							label='Reminders'
							description="Before a game you haven't answered yet."
							checked={prefs.reminders}
							disabled={!uid}
							onChange={next =>
								uid &&
								write(
									() => setNotificationPrefs(uid, { ...prefs, reminders: next }),
									"Couldn't save that preference."
								)
							}
						/>

						<Toggle
							label='Game changes'
							description='Cancellations, a moved kick-off, or a game short of players.'
							checked={prefs.gameChanges}
							disabled={!uid}
							onChange={next =>
								uid &&
								write(
									() => setNotificationPrefs(uid, { ...prefs, gameChanges: next }),
									"Couldn't save that preference."
								)
							}
						/>
					</div>
				</section>

				<section className='glass rounded-2xl p-5'>
					<h2 className='text-ink mb-3 font-semibold'>Seasons</h2>
					<Button variant='secondary' fullWidth onClick={() => router.push('/seasons')}>
						Switch season
					</Button>
				</section>

				{/* The only way into the app-admin screen. Hidden rather than
				    shown-and-denied: nobody else has anything to do there. */}
				{user.isAppAdmin && (
					<>
						<section className='glass rounded-2xl p-5'>
							<h2 className='text-ink mb-1 font-semibold'>App admins</h2>
							<p className='text-muted mb-3 text-sm leading-relaxed'>
								Manage who can create seasons and promote other admins.
							</p>
							<Button variant='secondary' fullWidth onClick={() => router.push('/admin')}>
								Manage app admins
							</Button>
						</section>

						<section className='glass rounded-2xl p-5'>
							<h2 className='text-ink mb-1 font-semibold'>Push debug</h2>
							<p className='text-muted mb-3 text-sm leading-relaxed'>
								Send each notification to your own devices, without staging the game state that would
								normally trigger it.
							</p>
							<Button variant='secondary' fullWidth onClick={() => router.push('/debug')}>
								Test notifications
							</Button>
						</section>
					</>
				)}

				<Button
					variant='ghost'
					fullWidth
					onClick={async () => {
						await signOutOfApp();
						router.push('/');
					}}
				>
					<ArrowRightStartOnRectangleIcon className='size-4' aria-hidden='true' />
					Sign out
				</Button>
			</div>
		</PageShell>
	);
};

export default MePage;
