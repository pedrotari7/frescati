'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightStartOnRectangleIcon, BellIcon } from '@heroicons/react/24/outline';
import { signOutOfApp, useAuth } from '../../../lib/auth';
import { checkPushSupport, disablePush, enablePush, getPermission } from '../../../lib/push';
import type { PushSupport } from '../../../lib/push';
import { globalNavItems } from '../../../components/BottomNav';
import PageShell from '../../../components/PageShell';
import Avatar from '../../../components/Avatar';
import Button from '../../../components/Button';
import StatusPill from '../../../components/StatusPill';

const MePage = () => {
	const router = useRouter();
	const { user } = useAuth();

	const [support, setSupport] = useState<PushSupport | null>(null);
	const [permission, setPermission] = useState<NotificationPermission>('default');
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		checkPushSupport().then(setSupport);
		setPermission(getPermission());
	}, []);

	if (!user) return null;

	const handleEnable = async () => {
		setMessage(null);

		const result = await enablePush(user.uid);
		setPermission(getPermission());
		setMessage(result.ok ? 'Notifications are on for this device.' : (result.reason ?? 'Something went wrong.'));
	};

	const handleDisable = async () => {
		setMessage(null);
		await disablePush(user.uid);
		setMessage('This device will no longer get notifications.');
	};

	const pushIsOn = permission === 'granted';

	return (
		<PageShell title='You' navItems={globalNavItems()}>
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
						(pushIsOn ? (
							<Button variant='secondary' fullWidth onClick={handleDisable}>
								Turn off on this device
							</Button>
						) : (
							<Button variant='primary' fullWidth onClick={handleEnable}>
								Turn on notifications
							</Button>
						))}

					{message && <p className='text-muted mt-3 text-xs'>{message}</p>}
				</section>

				<section className='glass rounded-2xl p-5'>
					<h2 className='text-ink mb-3 font-semibold'>Seasons</h2>
					<Button variant='secondary' fullWidth onClick={() => router.push('/seasons')}>
						Switch season
					</Button>
				</section>

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
