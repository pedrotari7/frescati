'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
	BanknotesIcon,
	ChevronRightIcon,
	Cog6ToothIcon,
	ShoppingBagIcon,
	UsersIcon,
} from '@heroicons/react/24/outline';
import { KIT_KIND_LABELS, groupKitByKind } from '@shared/kit';
import { entryShare, feesFor } from '@shared/finances';
import { byDisplayName, formatSek } from '@shared/format';
import { availabilityGames, buildAvailability } from '@shared/availability';
import { useSeasonContext } from '../../../../../components/SeasonProvider';
import { useKit, useUsersByUid } from '../../../../../hooks/useData';
import { useSeasonResponses } from '../../../../../hooks/useSeasonResponses';
import { personRow } from '../../../../../lib/people';
import SeasonShell from '../../../../../components/SeasonShell';
import Skeleton from '../../../../../components/Skeleton';
import EmptyState from '../../../../../components/EmptyState';
import LoadFailed from '../../../../../components/LoadFailed';
import Avatar from '../../../../../components/Avatar';
import StatusPill from '../../../../../components/StatusPill';
import AvailabilityDots, { AvailabilityLegend } from '../../../../../components/AvailabilityDots';
import { ListCard } from '../../../../../components/Section';

const MembersPage = () => {
	const { seasonId, season, games, loading, error, retry, isAdmin } = useSeasonContext();
	const { usersByUid } = useUsersByUid();
	const { kit } = useKit(seasonId);
	const {
		responses,
		loading: answersLoading,
		error: answersError,
		retry: retryAnswers,
	} = useSeasonResponses(seasonId, games);

	/** The games the strip has a dot for, which is every one still meant to be played. */
	const dotted = useMemo(() => availabilityGames(games), [games]);

	// The strip is built for everybody whether or not the answers have landed:
	// the games are what decide how many dots there are and where they break, so
	// building it early is what lets the rows hold their height. Until then every
	// mark reads `unanswered`, which is why `answersLoading` has to travel with
	// it rather than being checked here.
	const members = useMemo(() => {
		if (!season) return [];

		return season.memberUids
			.map(uid => ({ ...personRow(usersByUid, uid), availability: buildAvailability(uid, dotted, responses) }))
			.sort(byDisplayName);
	}, [season, usersByUid, dotted, responses]);

	if (loading) {
		return (
			<SeasonShell title='Club'>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (error) {
		return (
			<SeasonShell title='Club'>
				<LoadFailed what='the club' onRetry={retry} />
			</SeasonShell>
		);
	}

	if (!season) {
		return (
			<SeasonShell title='Club'>
				<EmptyState title='Season not found' />
			</SeasonShell>
		);
	}

	const fees = feesFor(season);

	// Kit and finances live behind the Club tab rather than a fifth and sixth one
	// of their own: both are the club's rather than any one game's, who is holding
	// what and who has paid what, and the tab bar deliberately never grows or
	// reflows, so a new tab would move every tab beside it on every screen in the
	// app. The tab is called Club rather than Squad for the same reason. The
	// roster is one of the three things on it, not the whole screen. All three are
	// shown to everyone:
	// anybody in the squad can hand a bag on, and an extra who owes for a game
	// needs somewhere to go and pay it.
	//
	// Above the roster rather than under it. A full squad is eighteen rows, so
	// underneath meant scrolling past every one of them to find the two things on
	// this screen that are somewhere to go rather than something to read.
	const kitLink = (
		<Link
			href={`/s/${seasonId}/kit`}
			className='glass-card flex items-center gap-3 rounded-2xl p-4 transition-colors hover:bg-white/5'
		>
			<ShoppingBagIcon className='text-brand size-5 shrink-0' aria-hidden='true' />
			<div className='min-w-0 flex-1'>
				<p className='text-ink text-sm font-semibold'>Kit</p>
				{/* Which kinds, not how many of each, "1 vests" is the sort of
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

	// The summary line is what each person owes rather than a balance, because a
	// balance would mean subscribing to the whole book from a screen that does not
	// otherwise read it, and an extra is not allowed to anyway. A member's share is
	// the bill divided by the squad, so it moves when somebody joins or leaves.
	const financesLink = (
		<Link
			href={`/s/${seasonId}/finances`}
			className='glass-card flex items-center gap-3 rounded-2xl p-4 transition-colors hover:bg-white/5'
		>
			<BanknotesIcon className='text-brand size-5 shrink-0' aria-hidden='true' />
			<div className='min-w-0 flex-1'>
				<p className='text-ink text-sm font-semibold'>Finances</p>
				<p className='text-faint text-xs'>
					{fees.total === 0 && fees.perGame === 0
						? 'Nothing is being collected'
						: `${formatSek(entryShare(fees.total, season.memberUids.length))} each, ${formatSek(fees.perGame)} a game as an extra`}
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

	// A failed read takes the dots away and leaves the roster, which is what the
	// screen is for. It says so out loud rather than drawing nothing, because a
	// season nobody has answered anything in and a read that never landed are
	// the same picture, and only one of them is worth pressing something about.
	const availabilityFailed = (
		<div className='mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs'>
			<span className='text-muted'>Couldn&apos;t load who has been playing.</span>
			<button type='button' onClick={retryAnswers} className='text-brand font-semibold'>
				Try again
			</button>
		</div>
	);

	return (
		<SeasonShell title='Club' subtitle={`${members.length} in ${season.name}`}>
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
					<div className='mb-4 space-y-3'>
						{kitLink}
						{financesLink}
					</div>

					{dotted.length > 0 &&
						(answersError ? availabilityFailed : <AvailabilityLegend className='mb-2 px-1' />)}

					<ListCard>
						{members.map(member => (
							<Link
								key={member.uid}
								href={`/u/${member.uid}`}
								className='block py-3 transition-colors hover:bg-white/5'
							>
								<div className='flex items-center gap-3'>
									<Avatar displayName={member.displayName} photoURL={member.photoURL} />
									<span className='text-ink flex-1 truncate text-sm'>{member.displayName}</span>
									{season.adminUids.includes(member.uid) && (
										<StatusPill tone='brand'>Admin</StatusPill>
									)}
								</div>

								{/* Under the whole row rather than beside the name, so
								    every strip gets the same width and therefore wraps
								    at the same game. Beside the name it would be the
								    admin pill deciding where one player's season broke
								    and not another's. */}
								{!answersError && member.availability.length > 0 && (
									<AvailabilityDots
										className='mt-2'
										marks={member.availability}
										timezone={season.slot.timezone}
										pending={answersLoading}
									/>
								)}
							</Link>
						))}
					</ListCard>

					{/* Managing the squad stays under the list it manages. */}
					{manageLink && <div className='mt-4'>{manageLink}</div>}

					<p className='text-faint mt-4 px-1 text-xs leading-relaxed'>
						Anyone signed in who isn&apos;t on this list can still put their hand up for a game, they show
						up as an extra.
					</p>
				</div>
			)}
		</SeasonShell>
	);
};

export default MembersPage;
