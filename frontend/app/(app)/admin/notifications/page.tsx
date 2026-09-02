'use client';

import { useMemo, useState } from 'react';
import { ArrowPathIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { AppUser, NotificationPrefs, PushDevice } from '@shared/types';
import type { PushReach, ReachLevel } from '@shared/notifications';
import { canEmail, getPushReach, getReachLevel, relevantPrefs } from '@shared/notifications';
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
 * from the outside: no device has ever been registered, the preferences are
 * switched off, or (on iPhone, and it is nearly always this) the app was never
 * added to the home screen, where Safari is the only place push works at all.
 *
 * The email fallback catches the first of those, so somebody with no device is
 * no longer necessarily unreachable, and this screen has to say which it is,
 * "gets the emails" and "hears nothing" want completely different conversations.
 *
 * Which is also why the list is in three parts rather than two. Reachable
 * answered "can we get a message to them at all", so somebody who only ever
 * gets an email sat in the same list as somebody whose phone buzzes, and there
 * are far more of the first than the second. `getReachLevel` is the split, and
 * the group at the bottom is the one nobody has to read.
 *
 * Preferences and the install signal live on the profile and arrive live with
 * everything else. Devices and addresses come from a callable, because push
 * tokens and email addresses are both unreadable from the client on purpose,
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
 * The three lists, worst first.
 *
 * `all` is last because it is the one an admin never has to read. Everything
 * the app sends arrives, and the only thing to do with those rows is scroll
 * past them. Splitting it out is what makes the two above it worth opening.
 */
const LEVELS: ReachLevel[] = ['none', 'some', 'all'];

const LEVEL_TITLE: Record<ReachLevel, string> = {
	none: 'Nothing gets through',
	some: 'Reachable, with gaps',
	all: 'Getting everything',
};

/**
 * What each list says when it is empty. Each answers its own heading rather
 * than restating the screen three times over.
 */
const LEVEL_EMPTY: Record<ReachLevel, string> = {
	none: 'Everyone can be reached.',
	some: 'Nobody has a gap.',
	all: 'Nobody is getting everything.',
};

/**
 * Every switch on a profile, so this can't fall behind one. Only the keys
 * `relevantPrefs` returns are ever rendered. `emailFallback` shows up as its
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
 * Absent is genuinely "never seen installed" rather than "not installed",
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

/**
 * Why the fallback didn't carry it, on a row push isn't reaching.
 *
 * Only asked on a `noDevice` row, because nowhere else does the answer change
 * anything. Push reaching them means the fallback never fires, and somebody who
 * muted every kind is not waiting on a channel. `null` is the third case, no
 * sender configured at all, which the banner at the top of the screen already
 * says once instead of on every row.
 */
const whyNoEmail = (user: AppUser, hasEmail: boolean): string | null => {
	if (user.notificationPrefs?.emailFallback === false) return `${PREF_LABEL.emailFallback} off`;

	return hasEmail ? null : 'No email address';
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

	// The headline counts everybody, the lists only what was searched for. A
	// total that moved as you typed would be a different number every keystroke
	// and would stop being the answer to "how many of us are reachable".
	const reached = rows.filter(row => levelOf(row) !== 'none').length;

	const term = search.trim().toLowerCase();
	const visible = term ? rows.filter(row => (row.user.displayName ?? '').toLowerCase().includes(term)) : rows;

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
						Preferences update live. Registered devices are read when this screen opens. Hit Refresh after
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
					/* Worst first. This screen gets opened because somebody isn't
					   getting their reminders, and the people it has nothing to
					   say about belong at the bottom. */
					LEVELS.map(level => (
						<Section
							key={level}
							title={LEVEL_TITLE[level]}
							rows={visible.filter(row => levelOf(row) === level)}
							now={now}
							empty={term ? 'Nobody matches that search.' : LEVEL_EMPTY[level]}
						/>
					))
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
	/** Whether there is an address at all, one of the two reasons it wouldn't. */
	hasEmail: boolean;
}

const levelOf = ({ reach, byEmail }: Row): ReachLevel => getReachLevel({ reach, byEmail });

const buildRows = (users: AppUser[], { devices, addressed, emailConfigured }: NotificationReach): Row[] =>
	users.map(candidate => {
		const registered = devices[candidate.uid] ?? [];
		const hasEmail = addressed.has(candidate.uid);

		return {
			user: candidate,
			devices: registered,
			reach: getPushReach({
				prefs: candidate.notificationPrefs,
				devices: registered.length,
				isAppAdmin: candidate.isAppAdmin === true,
			}),
			byEmail: emailConfigured && canEmail({ prefs: candidate.notificationPrefs, hasEmail }),
			hasEmail,
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

const PlayerRow = ({ row: { user, devices, reach, byEmail, hasEmail }, now }: { row: Row; now: Date }) => {
	const install = summariseInstall(user, now);
	const prefs = relevantPrefs(user.isAppAdmin === true);
	// Absent means opted in, the same way the backend reads it. Never show a
	// profile that predates a preference as having switched it off.
	const off = prefs.filter(key => user.notificationPrefs?.[key] === false);
	const noEmail = whyNoEmail(user, hasEmail);

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
				    needs no line here, the "No device" pill below says it. */}
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

					{/* The same row when the fallback didn't carry it. Somebody
					    with a perfectly good address can sit under "Nothing gets
					    through", and the screen used to say "No device" and
					    leave an admin with nothing to tell them. */}
					{reach === 'noDevice' && !byEmail && noEmail && <StatusPill tone='out'>{noEmail}</StatusPill>}

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
