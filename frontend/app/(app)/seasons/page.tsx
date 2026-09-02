'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { CalendarDaysIcon, PlusIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { SEASON_STATUS_LABELS } from '@shared/format';
import { useAuth } from '../../../lib/auth';
import { useSeasons } from '../../../hooks/useData';
import PageShell from '../../../components/PageShell';
import { useSeasonScope } from '../../../components/SeasonScope';
import Skeleton from '../../../components/Skeleton';
import EmptyState from '../../../components/EmptyState';
import StatusPill from '../../../components/StatusPill';
import Button from '../../../components/Button';
import { colors } from '../../tokens.stylex';
import { surfaces, utils } from '../../../lib/styles';

const styles = stylex.create({
	/* A column with gaps rather than `space-y`, which StyleX has no sibling
	   selector for. The New season button is the last child, so it takes the
	   same gap the cards do. */
	list: { display: 'flex', flexDirection: 'column', gap: 12, padding: 16 },
	card: { display: 'block', borderRadius: 16, padding: 16 },
	row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
	body: { minWidth: 0 },
	name: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	where: { color: colors.faint, marginTop: 2, fontSize: 12, lineHeight: '16px' },
	plus: { width: 16, height: 16 },
});

const SeasonsPage = () => {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { user } = useAuth();
	const { seasons, loading } = useSeasons();
	const { seasonId: currentSeasonId } = useSeasonScope();

	const active = useMemo(() => seasons.filter(season => season.status === 'active'), [seasons]);

	// With a single group there is almost always exactly one season on the go.
	// Skipping the picker saves a tap on every single visit, but only when
	// landing here fresh (from "/"). `?browse=1` marks a deliberate visit (the
	// "Switch season" button), which always shows the list, even with one
	// season, otherwise a solo season could never be reached to manage.
	//
	// Keyed on the id rather than the array: `filter` returns a new reference
	// every render, which would re-run this, and `router.replace`, in a loop.
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
								<PlusIcon {...stylex.props(styles.plus)} />
								New season
							</Button>
						) : undefined
					}
				/>
			) : (
				<div {...stylex.props(styles.list)}>
					{seasons.map(season => (
						<Link
							key={season.id}
							href={`/s/${season.id}`}
							{...stylex.props(surfaces.glassCard, styles.card)}
						>
							<div {...stylex.props(styles.row)}>
								<div {...stylex.props(styles.body)}>
									<p {...stylex.props(styles.name, utils.truncate)}>{season.name}</p>
									<p {...stylex.props(styles.where)}>
										{season.venue.name} · {season.memberUids.length} in the squad
									</p>
								</div>

								<StatusPill tone={season.status === 'active' ? 'in' : 'neutral'}>
									{SEASON_STATUS_LABELS[season.status]}
								</StatusPill>
							</div>
						</Link>
					))}

					{user?.isAppAdmin && (
						<Button variant='secondary' fullWidth onClick={() => router.push('/seasons/new')}>
							<PlusIcon {...stylex.props(styles.plus)} />
							New season
						</Button>
					)}
				</div>
			)}
		</PageShell>
	);
};

export default SeasonsPage;
