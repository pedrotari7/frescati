'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ChevronRightIcon, Cog6ToothIcon, ShoppingBagIcon, UsersIcon } from '@heroicons/react/24/outline';
import { KIT_KIND_LABELS, groupKitByKind } from '@shared/kit';
import { byDisplayName } from '@shared/format';
import { useSeasonContext } from '../../../../../components/SeasonProvider';
import { useKit, useUsersByUid } from '../../../../../hooks/useData';
import { personRow } from '../../../../../lib/people';
import SeasonShell from '../../../../../components/SeasonShell';
import Skeleton from '../../../../../components/Skeleton';
import EmptyState from '../../../../../components/EmptyState';
import Avatar from '../../../../../components/Avatar';
import StatusPill from '../../../../../components/StatusPill';
import { ListCard } from '../../../../../components/Section';

const MembersPage = () => {
	const { seasonId, season, loading, isAdmin } = useSeasonContext();
	const { usersByUid } = useUsersByUid();
	const { kit } = useKit(seasonId);

	const members = useMemo(() => {
		if (!season) return [];

		return season.memberUids.map(uid => personRow(usersByUid, uid)).sort(byDisplayName);
	}, [season, usersByUid]);

	if (loading) {
		return (
			<SeasonShell title='Squad'>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (!season) {
		return (
			<SeasonShell title='Squad'>
				<EmptyState title='Season not found' />
			</SeasonShell>
		);
	}

	// Kit lives behind the Squad tab rather than a fifth one of its own: it is a
	// property of the squad — who is holding what — and the tab bar deliberately
	// never grows or reflows, so a new tab would move every tab beside it on
	// every screen in the app. Shown to everyone, because anybody in the squad
	// can hand a bag on.
	const kitLink = (
		<Link
			href={`/s/${seasonId}/kit`}
			className='glass-card flex items-center gap-3 rounded-2xl p-4 transition-colors hover:bg-white/5'
		>
			<ShoppingBagIcon className='text-brand size-5 shrink-0' aria-hidden='true' />
			<div className='min-w-0 flex-1'>
				<p className='text-ink text-sm font-semibold'>Kit</p>
				{/* Which kinds, not how many of each — "1 vests" is the sort of
				    thing a count can't say. The screen itself has the detail. */}
				<p className='text-faint text-xs'>
					{kit.length === 0
						? 'Nothing listed yet'
						: groupKitByKind(kit)
								.map(group => KIT_KIND_LABELS[group.kind])
								.join(' · ')}
				</p>
			</div>
			<ChevronRightIcon className='text-faint size-4 shrink-0' aria-hidden='true' />
		</Link>
	);

	// In the body rather than the top bar: an admin-only control up there appears
	// on this screen and no other, which drags the tabs beside it around.
	//
	// Styled as a link rather than wrapping a <Button>, since a <button> inside
	// an <a> is invalid and breaks keyboard nav.
	const manageLink = isAdmin ? (
		<Link
			href={`/s/${seasonId}/admin/members`}
			className='glass-card text-ink flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm transition-all duration-150 active:scale-[0.98]'
		>
			<Cog6ToothIcon className='size-4' aria-hidden='true' />
			Manage squad
		</Link>
	) : null;

	return (
		<SeasonShell title='Squad' subtitle={`${members.length} in ${season.name}`}>
			{members.length === 0 ? (
				<EmptyState
					icon={<UsersIcon />}
					title='No squad yet'
					message={
						isAdmin
							? 'Add players to build the roster.'
							: 'An admin has not added anyone to this season yet.'
					}
					action={manageLink}
				/>
			) : (
				<div className='p-4'>
					<ListCard>
						{members.map(member => (
							<Link
								key={member.uid}
								href={`/u/${member.uid}`}
								className='flex items-center gap-3 py-3 transition-colors hover:bg-white/5'
							>
								<Avatar displayName={member.displayName} photoURL={member.photoURL} />
								<span className='text-ink flex-1 truncate text-sm'>{member.displayName}</span>
								{season.adminUids.includes(member.uid) && <StatusPill tone='brand'>Admin</StatusPill>}
							</Link>
						))}
					</ListCard>

					<div className='mt-4 space-y-3'>
						{kitLink}
						{manageLink}
					</div>

					<p className='text-faint mt-4 px-1 text-xs leading-relaxed'>
						Anyone signed in who isn&apos;t on this list can still put their hand up for a game — they show
						up as an extra.
					</p>
				</div>
			)}
		</SeasonShell>
	);
};

export default MembersPage;
