'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import type { AppUser } from '@shared/types';
import type { VisitRecency } from '@shared/visit';
import { DORMANT_DAYS, byLastSeen, visitRecency } from '@shared/visit';
import { formatRelative } from '@shared/format';
import { useAuth } from '../../../../lib/auth';
import { useUsers } from '../../../../hooks/useData';
import PageShell from '../../../../components/PageShell';
import AppAdminOnly from '../../../../components/AppAdminOnly';
import Skeleton from '../../../../components/Skeleton';
import Avatar from '../../../../components/Avatar';
import StatusPill from '../../../../components/StatusPill';
import { SearchInput } from '../../../../components/Field';
import { ListCard, ListEmpty, listRow, SectionHeading } from '../../../../components/Section';
import { bp, colors, tint } from '../../../tokens.stylex';
import { surfaces, utils } from '../../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 24, padding: 16 },

	headline: { borderRadius: 16, padding: 20 },
	/* The count is the answer, so it is the biggest thing on the screen. The
	   total beside it is context and drops back to body size. */
	count: { color: colors.ink, fontSize: 24, lineHeight: '32px', fontWeight: 600 },
	total: { color: colors.faint, fontSize: 16, lineHeight: '24px', fontWeight: 400 },
	caption: { color: colors.muted, marginTop: 2, fontSize: 14, lineHeight: '20px' },
	warning: { color: colors.pending, marginTop: 12, fontSize: 12, lineHeight: 1.625 },

	heading: { marginBottom: 8, paddingInline: 4 },
	note: { color: colors.faint, paddingInline: 4, fontSize: 12, lineHeight: 1.625 },

	row: {
		display: 'flex',
		alignItems: 'center',
		gap: 12,
		paddingBlock: 12,
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	body: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	/* Wraps rather than truncating, so a long name and the admin pill after it
	   are both readable on a phone. */
	nameRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 },
	name: { color: colors.ink, fontSize: 14, lineHeight: '20px' },
	joined: { color: colors.faint, marginTop: 2, fontSize: 12, lineHeight: '16px' },
	seen: { color: colors.muted, flexShrink: 0, textAlign: 'right', fontSize: 12, lineHeight: '16px' },
});

/**
 * Who is still around.
 *
 * The question this answers is the one that decides whether a season is worth
 * running again: not who is playing, the squad screens say that, but who has
 * quietly stopped opening the app at all. Somebody who has not been by in six
 * weeks is not going to answer a reminder, and until now nothing in the app
 * could tell that person apart from one who simply hasn't replied yet.
 *
 * Its own screen rather than a column on the notification list, which asks a
 * different question with a different fix: "we can't reach them" is a device or
 * a preference and is solvable from here, while "they stopped coming" is a
 * conversation to have in person.
 *
 * Sections run freshest first. The counts in each heading are what an admin
 * actually reads. The interesting number is how long the last two lists are.
 */

/**
 * `blurb` is what an empty section says, and an empty one is worth keeping:
 * "nobody has gone quiet" is the good news this screen is read for, and a
 * heading that vanished when the news was good would leave an admin unsure
 * whether it had been checked.
 *
 * `never` is the exception: it holds people no path through the app can
 * produce, since signing in writes the stamp and `set-admin` carries one
 * forward. Shown only when somebody is actually in it, so an impossible state
 * doesn't take up room on every visit.
 */
const SECTIONS: { key: VisitRecency; title: string; blurb: string; whenEmpty?: 'hide' }[] = [
	{ key: 'thisWeek', title: 'This week', blurb: 'Nobody has opened it since the last game.' },
	{ key: 'thisMonth', title: 'Past four weeks', blurb: 'Everybody is either fresh or long gone.' },
	{ key: 'dormant', title: 'Gone quiet', blurb: `Nobody has been away for more than ${DORMANT_DAYS / 7} weeks.` },
	{
		key: 'never',
		title: 'Never opened it',
		blurb: 'A profile exists, but nobody has ever had the app on screen with it.',
		whenEmpty: 'hide',
	},
];

const ActivityAdminPage = () => {
	const { user } = useAuth();
	const { users, loading } = useUsers();
	const [search, setSearch] = useState('');

	// One clock for the whole render, so two rows can't disagree about how long
	// ago "7 days" was and land either side of a section boundary.
	const now = new Date();

	const buckets = useMemo(() => {
		const grouped: Record<VisitRecency, AppUser[]> = { thisWeek: [], thisMonth: [], dormant: [], never: [] };

		for (const candidate of [...users].sort(byLastSeen)) {
			grouped[visitRecency(candidate.lastSeenAt, now)].push(candidate);
		}

		return grouped;
		// `now` is a fresh object every render and would defeat the memo, but it
		// only ever moves the boundary between two buckets by a few milliseconds,
		// recomputing on it would be work to change nothing.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [users]);

	if (!user?.isAppAdmin) {
		return (
			<AppAdminOnly
				title='Activity'
				message='This screen shows when every account last opened the app, so it stays behind the global role.'
			/>
		);
	}

	if (loading) {
		return (
			<PageShell title='Activity' backHref='/me'>
				<Skeleton />
			</PageShell>
		);
	}

	// The headline counts everybody; the lists below only what was searched for.
	// A total that moved as you typed would stop being the answer to "how many
	// of us are still around", the same reason the notification screen splits
	// the two.
	const active = buckets.thisWeek.length;
	const missing = buckets.dormant.length + buckets.never.length;

	const term = search.trim().toLowerCase();
	const matching = (candidates: AppUser[]) =>
		term ? candidates.filter(candidate => (candidate.displayName ?? '').toLowerCase().includes(term)) : candidates;

	return (
		<PageShell title='Activity' subtitle='Who is still around' backHref='/me'>
			<div {...stylex.props(styles.page)}>
				<section {...stylex.props(surfaces.glass, styles.headline)}>
					<p {...stylex.props(styles.count)}>
						{active}
						<span {...stylex.props(styles.total)}> of {users.length}</span>
					</p>
					<p {...stylex.props(styles.caption)}>opened the app this week</p>

					{missing > 0 && (
						<p {...stylex.props(styles.warning)}>
							{missing === 1 ? 'One person has' : `${missing} people have`} not opened it in over{' '}
							{DORMANT_DAYS / 7} weeks. They will not see a reminder however it is sent.
						</p>
					)}
				</section>

				<SearchInput
					label='Search by name'
					value={search}
					onChange={e => setSearch(e.target.value)}
					placeholder='Search by name'
				/>

				{SECTIONS.filter(({ key, whenEmpty }) => whenEmpty !== 'hide' || buckets[key].length > 0).map(
					({ key, title, blurb }) => (
						<Section
							key={key}
							title={title}
							blurb={blurb}
							players={matching(buckets[key])}
							now={now}
							searched={term !== ''}
						/>
					)
				)}

				<p {...stylex.props(styles.note)}>
					Counted on arrival, the app being opened, and every time it comes back to the foreground afterwards.
					Never on a timer, so a phone with it installed and forgotten in a pocket does not keep somebody
					looking active. A long session shows the time it started rather than the time it ended.
				</p>
			</div>
		</PageShell>
	);
};

const Section = ({
	title,
	blurb,
	players,
	now,
	searched,
}: {
	title: string;
	blurb: string;
	players: AppUser[];
	now: Date;
	searched: boolean;
}) => (
	<section>
		<SectionHeading sx={styles.heading}>
			{title} ({players.length})
		</SectionHeading>

		<ListCard>
			{players.length === 0 && <ListEmpty>{searched ? 'Nobody matches that search.' : blurb}</ListEmpty>}

			{players.map(player => (
				<PlayerRow key={player.uid} player={player} now={now} />
			))}
		</ListCard>
	</section>
);

/**
 * A link, like every other name in the app, an admin asking why somebody has
 * gone quiet usually wants their record next, and this saves a trip through a
 * roster to reach it.
 */
const PlayerRow = ({ player, now }: { player: AppUser; now: Date }) => (
	<Link href={`/u/${player.uid}`} {...stylex.props(listRow, styles.row)}>
		<Avatar displayName={player.displayName} photoURL={player.photoURL} />

		<div {...stylex.props(styles.body)}>
			<div {...stylex.props(styles.nameRow)}>
				<p {...stylex.props(styles.name, utils.truncate)}>{player.displayName}</p>
				{player.isAppAdmin && <StatusPill tone='brand'>App admin</StatusPill>}
			</div>

			{/* How long they have had an account is what separates a newcomer who
			    signed in once from a regular who has drifted off, the same
			    "never opened it" means opposite things for the two. */}
			{player.createdAt && <p {...stylex.props(styles.joined)}>Joined {formatRelative(player.createdAt, now)}</p>}
		</div>

		<span {...stylex.props(styles.seen)}>
			{player.lastSeenAt ? formatRelative(player.lastSeenAt, now) : 'Never'}
		</span>
	</Link>
);

export default ActivityAdminPage;
