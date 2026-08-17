'use client';

import { useMemo, useState } from 'react';
import { ArrowPathIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { AppUser, NotificationPrefs, PushDevice } from '@shared/types';
import type { PushReach } from '@shared/notifications';
import { canEmail, getPushReach, relevantPrefs } from '@shared/notifications';
import { describeDevice, platformLabel } from '@shared/device';
import { formatRelative } from '@shared/format';
import { useAuth } from '../../../../lib/auth';
import { useUsers } from '../../../../hooks/useData';
import { usePushDevices } from '../../../../hooks/usePushDevices';
import type { NotificationReach } from '../../../../lib/db/pushDevices';
import PageShell from '../../../../components/PageShell';
import AppAdminOnly from '../../../../components/AppAdminOnly';
import { SkeletonBlock } from '../../../../components/Skeleton';
import Avatar from '../../../../components/Avatar';
import Button from '../../../../components/Button';
import StatusPill from '../../../../components/StatusPill';
import type { PillTone } from '../../../../components/StatusPill';
import { TextInput } from '../../../../components/Field';
import { ListCard, ListEmpty, SectionHeading } from '../../../../components/Section';

/**
 * Who the app can actually reach, and why it can't reach the rest.
 *
 * The question this answers is the one an admin gets asked in person: "I never
 * get the reminders." Three different things cause that and they are invisible
 * from the outside — no device has ever been registered, the preferences are
 * switched off, or (on iPhone, and it is nearly always this) the app was never
 * added to the home screen, where Safari is the only place push works at all.
 *
 * The email fallback catches the first of those, so somebody with no device is
 * no longer necessarily unreachable, and this screen has to say which it is —
 * "gets the emails" and "hears nothing" want completely different conversations.
 *
 * Preferences and the install signal live on the profile and arrive live with
 * everything else. Devices and addresses come from a callable, because push
 * tokens and email addresses are both unreadable from the client on purpose —
 * see `usePushDevices`.
 */

const REACH_TONE: Record<PushReach, PillTone> = {
	reachable: 'in',
	partly: 'pending',
	muted: 'out',
	noDevice: 'out',
};

const REACH_LABEL: Record<PushReach, string> = {
	reachable: 'Getting everything',
	partly: 'Some kinds off',
	muted: 'All kinds off',
	noDevice: 'No device',
};

/**
 * Every switch on a profile, so this can't fall behind one. Only the keys
 * `relevantPrefs` returns are ever rendered — `emailFallback` shows up as its
 * own pill instead, because "Email off" alongside the muted kinds would read as
 * a fourth thing they aren't being sent.
 */
const PREF_LABEL: Record<keyof NotificationPrefs, string> = {
	reminders: 'Reminders',
	gameChanges: 'Game changes',
	newPlayers: 'New players',
	motm: 'Man of the match',
	emailFallback: 'Email fallback',
};

/**
 * What we know about whether they have it installed.
 *
 * Absent is genuinely "never seen installed" rather than "not installed" —
 * there is no way to observe an uninstall, and a profile written before this
 * was recorded has nothing to say either way. The copy stays on the safe side
 * of that: it reports what was last seen, not what is true now.
 *
 * Only iPhone gets the alarming tone. There, not being installed is the entire
 * reason nothing arrives; on Android and desktop push works perfectly well from
 * a browser tab and flagging it would send an admin chasing a non-problem.
 */
const summariseInstall = (user: AppUser, now: Date): { label: string; tone: PillTone } => {
	const client = user.client;

	if (!client) return { label: 'Never seen', tone: 'neutral' };

	if (client.lastStandaloneAt) {
		return { label: `Installed · ${formatRelative(client.lastStandaloneAt, now)}`, tone: 'in' };
	}

	return client.platform === 'ios'
		? { label: 'iPhone, not installed', tone: 'out' }
		: { label: `${platformLabel(client.platform)} · browser tab`, tone: 'neutral' };
};

const NotificationsAdminPage = () => {
	const { user } = useAuth();
	const isAppAdmin = user?.isAppAdmin === true;

	const { users, loading: usersLoading } = useUsers();
	const { reach, loading: devicesLoading, error, reload } = usePushDevices(isAppAdmin);
	const [search, setSearch] = useState('');

	// One clock for the whole render, so twenty rows can't disagree about how
	// long ago "3 days" was.
	const now = new Date();

	const rows = useMemo(() => buildRows(users, reach), [users, reach]);

	// The headline counts everybody, the lists only what was searched for — a
	// total that moved as you typed would be a different number every keystroke
	// and would stop being the answer to "how many of us are reachable".
	const reached = rows.filter(isReached).length;

	const term = search.trim().toLowerCase();
	const visible = term ? rows.filter(row => (row.user.displayName ?? '').toLowerCase().includes(term)) : rows;
	const reachable = visible.filter(isReached);
	const unreachable = visible.filter(row => !isReached(row));

	if (!isAppAdmin) {
		return (
			<AppAdminOnly
				title='Notifications'
				message='This screen shows what every account has registered, so it stays behind the global role.'
			/>
		);
	}

	const loading = usersLoading || devicesLoading;

	return (
		<PageShell title='Notifications' subtitle='Who the app can reach' backHref='/me'>
			<div className='space-y-6 p-4'>
				<section className='glass rounded-2xl p-5'>
					<div className='flex flex-wrap items-start justify-between gap-3'>
						<div className='min-w-0'>
							<p className='text-ink text-2xl font-semibold'>
								{reached}
								<span className='text-faint text-base font-normal'> of {rows.length}</span>
							</p>
							<p className='text-muted mt-0.5 text-sm'>can be reached, by push or by email</p>
						</div>

						<Button size='sm' variant='secondary' onClick={reload} disabled={devicesLoading}>
							<ArrowPathIcon className='size-4' aria-hidden='true' />
							Refresh
						</Button>
					</div>

					{/* Realtime everywhere else in the app, so the one screen
					    that isn't should say so rather than quietly go stale. */}
					<p className='text-faint mt-3 text-xs leading-relaxed'>
						Preferences update live. Registered devices are read when this screen opens — hit Refresh after
						somebody turns notifications on.
					</p>

					{/* Every row would otherwise read as push-only with no hint
					    that the fallback exists but was never set up. */}
					{!devicesLoading && !error && !reach.emailConfigured && (
						<p className='text-pending mt-3 text-xs leading-relaxed'>
							No email sender is configured, so nobody below gets the email fallback. See EMAIL_FROM and
							APP_URL in the README.
						</p>
					)}
				</section>

				{error && (
					<p className='text-out text-sm leading-relaxed'>
						Couldn&apos;t load registered devices, so every row below reads as having none and as getting no
						email either.
					</p>
				)}

				<div className='relative'>
					<MagnifyingGlassIcon
						className='text-faint pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2'
						aria-hidden='true'
					/>
					<TextInput
						value={search}
						onChange={e => setSearch(e.target.value)}
						placeholder='Search by name'
						className='pl-10'
						type='search'
					/>
				</div>

				{loading ? (
					<div className='space-y-3'>
						<SkeletonBlock className='h-24' />
						<SkeletonBlock className='h-24' />
						<SkeletonBlock className='h-24' />
					</div>
				) : (
					<>
						{/* The actionable half first — this screen gets opened
						    because somebody isn't getting their reminders. */}
						<Section
							title='Nothing gets through'
							rows={unreachable}
							now={now}
							empty={term ? 'Nobody matches that search.' : 'Everyone is reachable.'}
						/>
						<Section
							title='Reachable'
							rows={reachable}
							now={now}
							empty={term ? 'Nobody matches that search.' : 'Nobody is reachable yet.'}
						/>
					</>
				)}
			</div>
		</PageShell>
	);
};

interface Row {
	user: AppUser;
	devices: PushDevice[];
	reach: PushReach;
	/** Whether the fallback would carry what push can't. */
	byEmail: boolean;
}

/**
 * Something still gets through. A partial opt-out is still a way to reach them,
 * and so is the email fallback — but only where push is failing for want of a
 * device. Somebody who muted a kind outright is not rescued by a channel that
 * only ever carries the kinds they left switched on.
 */
const isReached = (row: Row): boolean =>
	row.reach === 'reachable' || row.reach === 'partly' || (row.reach === 'noDevice' && row.byEmail);

const buildRows = (users: AppUser[], { devices, addressed, emailConfigured }: NotificationReach): Row[] =>
	users.map(candidate => {
		const registered = devices[candidate.uid] ?? [];

		return {
			user: candidate,
			devices: registered,
			reach: getPushReach({
				prefs: candidate.notificationPrefs,
				devices: registered.length,
				isAppAdmin: candidate.isAppAdmin === true,
			}),
			byEmail:
				emailConfigured &&
				canEmail({ prefs: candidate.notificationPrefs, hasEmail: addressed.has(candidate.uid) }),
		};
	});

const Section = ({ title, rows, now, empty }: { title: string; rows: Row[]; now: Date; empty: string }) => (
	<section>
		<SectionHeading className='mb-2 px-1'>
			{title} ({rows.length})
		</SectionHeading>

		<ListCard>
			{rows.length === 0 && <ListEmpty>{empty}</ListEmpty>}

			{rows.map(row => (
				<PlayerRow key={row.user.uid} row={row} now={now} />
			))}
		</ListCard>
	</section>
);

const PlayerRow = ({ row: { user, devices, reach, byEmail }, now }: { row: Row; now: Date }) => {
	const install = summariseInstall(user, now);
	const prefs = relevantPrefs(user.isAppAdmin === true);
	// Absent means opted in, the same way the backend reads it — never show a
	// profile that predates a preference as having switched it off.
	const off = prefs.filter(key => user.notificationPrefs?.[key] === false);

	return (
		<div className='flex items-start gap-3 py-3'>
			<Avatar displayName={user.displayName} photoURL={user.photoURL} />

			<div className='min-w-0 flex-1'>
				<div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
					<p className='text-ink truncate text-sm'>{user.displayName}</p>
					{user.isAppAdmin && <StatusPill tone='brand'>App admin</StatusPill>}
				</div>

				{/* Listed rather than counted: two phones and a laptop is a
				    different situation from one registration that's a year old,
				    and the count is obvious from the list anyway. Nothing at all
				    needs no line here — the "No device" pill below says it. */}
				{devices.length > 0 && (
					<ul className='text-faint mt-1 space-y-0.5 text-xs'>
						{devices.map((device, index) => (
							<li key={`${device.platform}-${device.registeredAt}-${index}`}>
								{describeDevice(device)}
								{device.registeredAt && ` · registered ${formatRelative(device.registeredAt, now)}`}
							</li>
						))}
					</ul>
				)}

				<div className='mt-2 flex flex-wrap items-center gap-1.5'>
					<StatusPill tone={REACH_TONE[reach]}>{REACH_LABEL[reach]}</StatusPill>

					{/* Only where it changes the answer. Push reaching them
					    already means the fallback never fires, so saying they
					    also have an address would be noise on every row. */}
					{reach === 'noDevice' && byEmail && <StatusPill tone='in'>Emailed instead</StatusPill>}

					<StatusPill tone={install.tone}>{install.label}</StatusPill>

					{/* Only the switched-off kinds. Three green pills on every
					    row would say nothing and hide the one row that differs. */}
					{off.map(key => (
						<StatusPill key={key} tone='neutral'>
							{PREF_LABEL[key]} off
						</StatusPill>
					))}
				</div>
			</div>
		</div>
	);
};

export default NotificationsAdminPage;
