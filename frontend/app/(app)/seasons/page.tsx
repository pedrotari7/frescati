'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { CalendarDaysIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../../lib/auth';
import { useSeasons } from '../../../hooks/useData';
import PageShell from '../../../components/PageShell';
import { useSeasonScope } from '../../../components/SeasonScope';
import Skeleton from '../../../components/Skeleton';
import EmptyState from '../../../components/EmptyState';
import StatusPill from '../../../components/StatusPill';
import Button from '../../../components/Button';

const SeasonsPage = () => {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { user } = useAuth();
	const { seasons, loading } = useSeasons();
	const { seasonId: currentSeasonId } = useSeasonScope();

	const active = useMemo(() => seasons.filter(season => season.status === 'active'), [seasons]);

	// With a single group there is almost always exactly one season on the go.
	// Skipping the picker saves a tap on every single visit — but only when
	// landing here fresh (from "/"). `?browse=1` marks a deliberate visit (the
	// "Switch season" button), which always shows the list, even with one
	// season — otherwise a solo season could never be reached to manage.
	//
	// Keyed on the id rather than the array: `filter` returns a new reference
	// every render, which would re-run this — and `router.replace` — in a loop.
	const browsing = searchParams.get('browse') === '1';
	const soleActiveId = !browsing && active.length === 1 ? active[0].id : null;

	useEffect(() => {
		if (!loading && soleActiveId) router.replace(`/s/${soleActiveId}`);
	}, [loading, soleActiveId, router]);

	// A picker, not a destination: it carries no tabs of its own, so entering a
	// season doesn't reshape the bar. Back returns to the season you left.
	return (
		<PageShell title='Seasons' backHref={currentSeasonId ? `/s/${currentSeasonId}` : undefined}>
			{loading ? (
				<Skeleton />
			) : seasons.length === 0 ? (
				<EmptyState
					icon={<CalendarDaysIcon />}
					title='No seasons yet'
					message={
						user?.isAppAdmin
							? 'Create one to start scheduling games.'
							: 'An admin needs to set one up before there is anything to see here.'
					}
					action={
						user?.isAppAdmin ? (
							<Button variant='primary' onClick={() => router.push('/seasons/new')}>
								<PlusIcon className='size-4' />
								New season
							</Button>
						) : undefined
					}
				/>
			) : (
				<div className='space-y-3 p-4'>
					{seasons.map(season => (
						<Link
							key={season.id}
							href={`/s/${season.id}`}
							className='glass-card block rounded-2xl p-4 transition-transform'
						>
							<div className='flex items-center justify-between gap-3'>
								<div className='min-w-0'>
									<p className='text-ink truncate font-semibold'>{season.name}</p>
									<p className='text-faint mt-0.5 text-xs'>
										{season.venue.name} · {season.memberUids.length} in the squad
									</p>
								</div>

								<StatusPill tone={season.status === 'active' ? 'in' : 'neutral'}>
									{season.status}
								</StatusPill>
							</div>
						</Link>
					))}

					{user?.isAppAdmin && (
						<Button variant='secondary' fullWidth onClick={() => router.push('/seasons/new')}>
							<PlusIcon className='size-4' />
							New season
						</Button>
					)}
				</div>
			)}
		</PageShell>
	);
};

export default SeasonsPage;
