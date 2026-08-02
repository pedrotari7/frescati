'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Cog6ToothIcon, UsersIcon } from '@heroicons/react/24/outline';
import { useSeasonContext } from '../../../../../components/SeasonProvider';
import { useUsers } from '../../../../../hooks/useData';
import SeasonShell from '../../../../../components/SeasonShell';
import Skeleton from '../../../../../components/Skeleton';
import EmptyState from '../../../../../components/EmptyState';
import Avatar from '../../../../../components/Avatar';
import StatusPill from '../../../../../components/StatusPill';

const MembersPage = () => {
	const { seasonId, season, loading, isAdmin } = useSeasonContext();
	const { users } = useUsers();

	const members = useMemo(() => {
		if (!season) return [];

		const byUid = new Map(users.map(user => [user.uid, user]));

		return season.memberUids
			.map(uid => {
				const user = byUid.get(uid);

				return {
					uid,
					displayName: user?.displayName ?? 'Unknown player',
					photoURL: user?.photoURL ?? null,
				};
			})
			.sort((a, b) => a.displayName.localeCompare(b.displayName));
	}, [season, users]);

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
					<div className='glass divide-y divide-white/5 rounded-2xl px-4'>
						{members.map(member => (
							<div key={member.uid} className='flex items-center gap-3 py-3'>
								<Avatar displayName={member.displayName} photoURL={member.photoURL} />
								<span className='text-ink flex-1 truncate text-sm'>{member.displayName}</span>
								{season.adminUids.includes(member.uid) && <StatusPill tone='brand'>Admin</StatusPill>}
							</div>
						))}
					</div>

					{manageLink && <div className='mt-4'>{manageLink}</div>}

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
