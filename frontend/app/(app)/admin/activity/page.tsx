'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
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
import { TextInput } from '../../../../components/Field';
import { ListCard, ListEmpty, SectionHeading } from '../../../../components/Section';

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
			<div className='space-y-6 p-4'>
				<section className='glass rounded-2xl p-5'>
					<p className='text-ink text-2xl font-semibold'>
						{active}
						<span className='text-faint text-base font-normal'> of {users.length}</span>
					</p>
					<p className='text-muted mt-0.5 text-sm'>opened the app this week</p>

					{missing > 0 && (
						<p className='text-pending mt-3 text-xs leading-relaxed'>
							{missing === 1 ? 'One person has' : `${missing} people have`} not opened it in over{' '}
							{DORMANT_DAYS / 7} weeks. They will not see a reminder however it is sent.
						</p>
					)}
				</section>

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

				<p className='text-faint px-1 text-xs leading-relaxed'>
					Counted on arrival, the app being opened, and every time it comes back to the foreground
					afterwards. Never on a timer, so a phone with it installed and forgotten in a pocket does not keep
					somebody looking active. A long session shows the time it started rather than the time it ended.
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
		<SectionHeading className='mb-2 px-1'>
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
	<Link href={`/u/${player.uid}`} className='flex items-center gap-3 py-3 transition-colors hover:bg-white/5'>
		<Avatar displayName={player.displayName} photoURL={player.photoURL} />

		<div className='min-w-0 flex-1'>
			<div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
				<p className='text-ink truncate text-sm'>{player.displayName}</p>
				{player.isAppAdmin && <StatusPill tone='brand'>App admin</StatusPill>}
			</div>

			{/* How long they have had an account is what separates a newcomer who
			    signed in once from a regular who has drifted off, the same
			    "never opened it" means opposite things for the two. */}
			{player.createdAt && (
				<p className='text-faint mt-0.5 text-xs'>Joined {formatRelative(player.createdAt, now)}</p>
			)}
		</div>

		<span className='text-muted shrink-0 text-right text-xs'>
			{player.lastSeenAt ? formatRelative(player.lastSeenAt, now) : 'Never'}
		</span>
	</Link>
);

export default ActivityAdminPage;
