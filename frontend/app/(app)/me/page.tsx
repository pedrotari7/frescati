'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRightStartOnRectangleIcon, BellIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { signOutOfApp, useAuth } from '../../../lib/auth';
import { buildLabel } from '../../../lib/build';
import { checkPushSupport, disablePush, enablePush, isPushEnabled } from '../../../lib/push';
import type { PushSupport } from '../../../lib/push';
import { DEFAULT_NOTIFICATION_PREFS } from '@shared/types';
import type { NotificationPrefs } from '@shared/types';
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
import { bp, colors, tint } from '../../tokens.stylex';
import { surfaces, utils } from '../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 16, padding: 16 },

	profile: {
		display: 'flex',
		alignItems: 'center',
		gap: 16,
		borderRadius: 16,
		padding: 20,
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	body: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	name: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	email: { color: colors.faint, fontSize: 12, lineHeight: '16px' },
	pill: { marginTop: 6 },
	chevron: { color: colors.faint, width: 20, height: 20, flexShrink: 0 },

	card: { borderRadius: 16, padding: 20 },
	cardTitle: { color: colors.ink, marginBottom: 4, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	/* No blurb under it, so the heading owns the gap the blurb would have. */
	titleAlone: { marginBottom: 12 },
	blurb: { color: colors.muted, marginBottom: 12, fontSize: 14, lineHeight: 1.625 },

	bellRow: { marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 },
	bell: { color: colors.muted, width: 20, height: 20 },
	notifyBlurb: { color: colors.muted, marginBottom: 16, fontSize: 14, lineHeight: 1.625 },
	install: { color: colors.pending, marginBottom: 16, fontSize: 14, lineHeight: '20px' },
	unsupported: { color: colors.faint, marginBottom: 16, fontSize: 14, lineHeight: '20px' },
	message: { color: colors.muted, marginTop: 12, fontSize: 12, lineHeight: '16px' },
	/* The switches carry their own hairlines. This only draws the line above the
	   first one, which is the join to the button over it. */
	switches: {
		marginTop: 16,
		borderTopWidth: 1,
		borderTopStyle: 'solid',
		borderTopColor: tint.white5,
		paddingTop: 4,
	},

	out: { width: 16, height: 16 },
	build: { color: colors.faint, paddingTop: 4, textAlign: 'center', fontSize: 12, lineHeight: '16px' },
});

/**
 * One of the screens that hangs off this one, with the sentence saying what it
 * is for.
 *
 * A component rather than the six near-identical blocks the class-name version
 * carried, where a heading, a blurb and a full-width button were kept in step
 * by hand.
 */
const LinkCard = ({ title, blurb, label, href }: { title: string; blurb?: string; label: string; href: string }) => {
	const router = useRouter();

	return (
		<section {...stylex.props(surfaces.glass, styles.card)}>
			<h2 {...stylex.props(styles.cardTitle, !blurb && styles.titleAlone)}>{title}</h2>
			{blurb && <p {...stylex.props(styles.blurb)}>{blurb}</p>}

			<Button variant='secondary' fullWidth onClick={() => router.push(href)}>
				{label}
			</Button>
		</section>
	);
};

const MePage = () => {
	const router = useRouter();
	const { user } = useAuth();
	const { seasonId } = useSeasonScope();
	const write = useWrite();

	const [support, setSupport] = useState<PushSupport | null>(null);
	// `null` while we're still asking. Reflects whether this device holds a
	// registered token, not whether the browser has granted permission, those
	// diverge the moment somebody turns notifications off.
	const [enabled, setEnabled] = useState<boolean | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const uid = user?.uid;

	// The stored preferences, which apply to the account rather than this
	// device. The backend checks them before sending anything.
	//
	// Merged over the defaults rather than swapped for them: a profile written
	// before a preference existed is missing that key, and the backend reads
	// absent as opted in. Falling back only when the whole map is missing would
	// draw those switches off while notifications kept arriving, and saving any
	// other row would then write the wrong value in.
	const { user: profile, loading: profileLoading } = useUser(uid ?? null);
	const prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...profile?.notificationPrefs };

	/**
	 * Every switch writes the whole map, so none of them may be touched before
	 * the profile has arrived.
	 *
	 * Until the first snapshot lands, `prefs` above is five hard-coded defaults
	 * rather than what this account chose, so a tap during that window saved
	 * the one preference asked for and silently turned the other four back on.
	 * Somebody who muted reminders months ago and came here to switch off the
	 * email fallback got both back, with nothing on screen to say so.
	 *
	 * One helper rather than the guard repeated per row: a sixth switch added
	 * below inherits it instead of having to remember it.
	 */
	const savePref = (key: keyof NotificationPrefs, next: boolean) => {
		if (!uid || profileLoading) return;

		void write(() => setNotificationPrefs(uid, { ...prefs, [key]: next }), "Couldn't save that preference.");
	};

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
			<div {...stylex.props(styles.page)}>
				{/* The card is the way to your own player screen, the same tap as
				    on your name anywhere else, rather than a row saying "Your
				    record" that would only ever be about you. */}
				<Link href={`/u/${user.uid}`} {...stylex.props(surfaces.glass, styles.profile)}>
					<Avatar displayName={user.displayName} photoURL={user.photoURL} size='lg' />
					<div {...stylex.props(styles.body)}>
						<p {...stylex.props(styles.name, utils.truncate)}>{user.displayName}</p>
						<p {...stylex.props(styles.email, utils.truncate)}>{user.email}</p>
						{user.isAppAdmin && (
							<StatusPill tone='brand' sx={styles.pill}>
								App admin
							</StatusPill>
						)}
					</div>
					<ChevronRightIcon {...stylex.props(styles.chevron)} aria-hidden='true' />
				</Link>

				<section {...stylex.props(surfaces.glass, styles.card)}>
					<div {...stylex.props(styles.bellRow)}>
						<BellIcon {...stylex.props(styles.bell)} aria-hidden='true' />
						<h2 {...stylex.props(styles.cardTitle)}>Notifications</h2>
					</div>

					<p {...stylex.props(styles.notifyBlurb)}>
						Get a nudge when it&apos;s time to say whether you&apos;re playing, and a heads-up if a game is
						short or called off.
					</p>

					{support === 'needs-install' && (
						<p {...stylex.props(styles.install)}>
							On iPhone and iPad, add Frescati to your home screen first. Safari only allows notifications
							for installed apps.
							{prefs.emailFallback && ' Until then these go to your email instead.'}
						</p>
					)}

					{support === 'unsupported' && (
						<p {...stylex.props(styles.unsupported)}>
							This browser doesn&apos;t support notifications.
							{prefs.emailFallback && ' These go to your email instead.'}
						</p>
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

					{message && <p {...stylex.props(styles.message)}>{message}</p>}

					{/* Separate from the per-device switch above: these say which
					    kinds you want at all, on every device you've registered. */}
					<div {...stylex.props(styles.switches)}>
						<Toggle
							label='Reminders'
							description="Before a game you haven't answered yet."
							checked={prefs.reminders}
							disabled={!uid || profileLoading}
							onChange={next => savePref('reminders', next)}
						/>

						<Toggle
							label='Game changes'
							description='Cancellations, a moved kick-off, or a game short of players.'
							checked={prefs.gameChanges}
							disabled={!uid || profileLoading}
							onChange={next => savePref('gameChanges', next)}
						/>

						<Toggle
							label='Man of the match'
							description='When a game is confirmed and it is time to vote.'
							checked={prefs.motm}
							disabled={!uid || profileLoading}
							onChange={next => savePref('motm', next)}
						/>

						{/* Nobody else is ever sent one, so showing this to them
						    would be a switch with nothing behind it. */}
						{user.isAppAdmin && (
							<Toggle
								label='New players'
								description='When somebody signs into the app for the first time.'
								checked={prefs.newPlayers}
								disabled={!uid || profileLoading}
								onChange={next => savePref('newPlayers', next)}
							/>
						)}

						{/* A channel rather than a kind, and the last row for
						    that reason: it decides how the switches above
						    travel, never what they cover. */}
						<Toggle
							label='Email me if notifications fail'
							description={
								user.email
									? `Sends to ${user.email} when a notification can't reach your devices.`
									: "Sends an email when a notification can't reach your devices."
							}
							checked={prefs.emailFallback}
							disabled={!uid || profileLoading}
							onChange={next => savePref('emailFallback', next)}
						/>
					</div>
				</section>

				<LinkCard title='Seasons' label='Switch season' href='/seasons?browse=1' />

				{/* The only way into the app-admin screen. Hidden rather than
				    shown-and-denied: nobody else has anything to do there. */}
				{user.isAppAdmin && (
					<>
						<LinkCard
							title='App admins'
							blurb='Manage who can create seasons and promote other admins.'
							label='Manage app admins'
							href='/admin'
						/>

						<LinkCard
							title='Starting ratings'
							blurb='Tell the balancer what a new player is worth before they have played, instead of starting everybody on the group average.'
							label='Set starting ratings'
							href='/admin/ratings'
						/>

						<LinkCard
							title='Who gets notified'
							blurb="Every account's notification settings, the devices they have registered, and who never added the app to their home screen."
							label='Notification status'
							href='/admin/notifications'
						/>

						<LinkCard
							title='Activity'
							blurb='When everybody last opened the app, so you can see who has quietly stopped turning up before a season is planned around them.'
							label="See who's still around"
							href='/admin/activity'
						/>

						<LinkCard
							title='Debug'
							blurb='Send each notification to your own devices, without staging the game state that would normally trigger it, and break things on purpose to check error reporting is working.'
							label='Open debug'
							href='/debug'
						/>
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
					<ArrowRightStartOnRectangleIcon {...stylex.props(styles.out)} aria-hidden='true' />
					Sign out
				</Button>

				{/* Shown to everybody rather than only to admins, because the point
				    of it is to be readable off somebody else's phone: "the app is
				    broken" and "which build are you on" are the same question, and
				    an admin-only version could never be asked of the person it is
				    broken for. Faint and last. Nobody needs it until they are
				    asked for it. */}
				<p {...stylex.props(styles.build)}>Build {buildLabel()}</p>
			</div>
		</PageShell>
	);
};

export default MePage;
