'use client';

import Link from 'next/link';
import { ArrowPathIcon, BellAlertIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { AppUser } from '@shared/types';
import { byDisplayName } from '@shared/format';
import { personRow } from '../lib/people';
import Avatar from './Avatar';
import Button from './Button';
import { SkeletonBlock } from './Skeleton';
import { bp, colors, tint } from '../app/tokens.stylex';
import { surfaces, utils } from '../lib/styles';

const styles = stylex.create({
	card: { borderRadius: 16, padding: 16 },

	head: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
	title: { display: 'flex', minWidth: 0, alignItems: 'center', gap: 8 },
	bell: { color: colors.brand, width: 16, height: 16, flexShrink: 0 },
	heading: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	count: { color: colors.faint, fontWeight: 400 },
	icon: { width: 16, height: 16 },

	skeleton: { marginTop: 12, height: 32 },
	failed: { color: colors.out, marginTop: 12, fontSize: 14, lineHeight: 1.625 },
	empty: { color: colors.faint, marginTop: 12, fontSize: 14, lineHeight: '20px' },

	/* Wraps rather than scrolls: a squad is fifteen chips and a phone can have
	   them in four rows without anything being hidden off the side. */
	people: { marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 },
	chip: {
		display: 'flex',
		alignItems: 'center',
		gap: 8,
		borderRadius: 9999,
		backgroundColor: { default: tint.white5, [bp.hover]: { default: null, ':hover': tint.white10 } },
		paddingBlock: 4,
		paddingRight: 12,
		paddingLeft: 4,
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	/* Capped rather than shrunk, so one long name cannot squeeze the rest of
	   the row down to initials. */
	name: { color: colors.ink, maxWidth: 160, fontSize: 14, lineHeight: '20px' },

	footnote: { color: colors.faint, marginTop: 12, fontSize: 12, lineHeight: 1.625 },
	link: { color: colors.muted, textDecorationLine: 'underline', textUnderlineOffset: 2 },
});

/**
 * Who has the bell on for this game, for an app admin.
 *
 * `availability` is the one notification whose audience isn't already on the
 * screen. Every other kind goes somewhere an admin can see, the roster, the
 * people who answered, the other admins, so the only one they have to be told
 * about is the one nobody signed up for in public. This is the answer to "who
 * hears about it if I move kick-off", asked a moment before doing exactly that.
 *
 * Drawn alongside the bell rather than on `/admin/notifications`, which is a
 * per-person screen about the app as a whole: this is per game, and the game is
 * where the question is asked. It appears and disappears with the bell for the
 * same reason the bell has an `isWatchable` behind it, on a cancelled or a
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
		<section {...stylex.props(surfaces.glass, styles.card)}>
			<div {...stylex.props(styles.head)}>
				<div {...stylex.props(styles.title)}>
					<BellAlertIcon {...stylex.props(styles.bell)} aria-hidden='true' />
					<h2 {...stylex.props(styles.heading)}>
						Following this game
						{!loading && !error && <span {...stylex.props(styles.count)}> ({watchers.length})</span>}
					</h2>
				</div>

				{/* Realtime everywhere else, so the one card that isn't says so
				    rather than quietly going stale, same bargain as the admin
				    notifications screen, and for the same reason: the rule that
				    keeps this private is what rules out a listener. */}
				<Button size='sm' variant='secondary' onClick={onReload} disabled={loading}>
					<ArrowPathIcon {...stylex.props(styles.icon)} aria-hidden='true' />
					Refresh
				</Button>
			</div>

			{loading ? (
				<SkeletonBlock sx={styles.skeleton} />
			) : error ? (
				<p {...stylex.props(styles.failed)}>Couldn&apos;t load who is following this game.</p>
			) : watchers.length === 0 ? (
				<p {...stylex.props(styles.empty)}>Nobody has turned notifications on for this game.</p>
			) : (
				<ul {...stylex.props(styles.people)}>
					{watchers.map(watcher => (
						<li key={watcher.uid}>
							<Link href={`/u/${watcher.uid}`} {...stylex.props(styles.chip)}>
								<Avatar displayName={watcher.displayName} photoURL={watcher.photoURL} size='sm' />
								<span {...stylex.props(styles.name, utils.truncate)}>{watcher.displayName}</span>
							</Link>
						</li>
					))}
				</ul>
			)}

			{/* Following is necessary, not sufficient: the availability push
			    still needs a registered device or an address to fall back to, and
			    that is a different screen's question. Only worth saying when
			    there is somebody it could be true of. */}
			{!loading && !error && watchers.length > 0 && (
				<p {...stylex.props(styles.footnote)}>
					They hear whenever somebody&apos;s answer moves, if the app can reach them at all. Check{' '}
					<Link href='/admin/notifications' {...stylex.props(styles.link)}>
						Notifications
					</Link>{' '}
					for who it can&apos;t.
				</p>
			)}
		</section>
	);
};

export default GameWatchers;
