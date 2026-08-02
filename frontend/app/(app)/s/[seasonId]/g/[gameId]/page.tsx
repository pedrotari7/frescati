'use client';

import { use, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ChevronRightIcon, MapPinIcon, TrophyIcon } from '@heroicons/react/24/outline';
import { getFormat, getGameLifecycle } from '@shared/game';
import { MIN_TOURNAMENT_PLAYERS } from '@shared/tournament';
import { formatGameDateLong, formatGameTime, formatRelative } from '@shared/format';
import { useSeasonContext } from '../../../../../../components/SeasonProvider';
import { useResponses, useUsers } from '../../../../../../hooks/useData';
import { useMyResponses } from '../../../../../../hooks/useMyResponses';
import { useRespond } from '../../../../../../hooks/useRespond';
import { useRespondIntent } from '../../../../../../hooks/useRespondIntent';
import { useWrite } from '../../../../../../hooks/useWrite';
import { useNow } from '../../../../../../hooks/useNow';
import { setConfirmOverride } from '../../../../../../lib/db/responses';
import SeasonShell from '../../../../../../components/SeasonShell';
import Skeleton from '../../../../../../components/Skeleton';
import EmptyState from '../../../../../../components/EmptyState';
import HeadcountBar from '../../../../../../components/HeadcountBar';
import RespondControl from '../../../../../../components/RespondControl';
import RosterList from '../../../../../../components/RosterList';
import StatusPill from '../../../../../../components/StatusPill';

const GamePage = ({ params }: { params: Promise<{ seasonId: string; gameId: string }> }) => {
	const { gameId } = use(params);
	const { seasonId, season, games, loading, isAdmin, role } = useSeasonContext();
	const { responses } = useResponses(seasonId, gameId);
	const { users } = useUsers();
	const { myResponses } = useMyResponses();
	const { respond, clear } = useRespond(seasonId, role, myResponses);
	const write = useWrite();
	const now = useNow();

	const game = games.find(candidate => candidate.id === gameId) ?? null;
	const usersByUid = useMemo(() => new Map(users.map(user => [user.uid, user])), [users]);

	// Arriving from a notification's "I'm in" button. Runs before the early
	// returns below so it isn't skipped while the page is still loading.
	const lifecycleForIntent = season && game ? getGameLifecycle(game, season, now) : null;

	useRespondIntent({
		ready: !loading && !!season && !!game,
		isOpen: lifecycleForIntent === 'open',
		onRespond: useCallback(status => respond(gameId, status), [respond, gameId]),
	});

	if (loading) {
		return (
			<SeasonShell title='Game' backHref={`/s/${seasonId}`}>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (!season || !game) {
		return (
			<SeasonShell title='Game' backHref={`/s/${seasonId}`}>
				<EmptyState title='Game not found' message='It may have been deleted from the calendar.' />
			</SeasonShell>
		);
	}

	const lifecycle = getGameLifecycle(game, season, now);
	const timezone = season.slot.timezone;

	return (
		<SeasonShell
			title={formatGameDateLong(game.kickoff, timezone)}
			subtitle={`${formatGameTime(game.kickoff, timezone)} · ${game.venue.name}`}
			backHref={`/s/${seasonId}`}
		>
			<div className='space-y-6 p-4'>
				<section className='glass rounded-3xl p-5'>
					<div className='mb-4 flex flex-wrap items-center gap-2'>
						<span className='text-faint text-xs'>{formatRelative(game.kickoff)}</span>
						{game.isOneOff && <StatusPill tone='extra'>One-off</StatusPill>}
						{lifecycle === 'cancelled' && <StatusPill tone='out'>Cancelled</StatusPill>}
						{lifecycle === 'locked' && <StatusPill tone='neutral'>Answers closed</StatusPill>}
						{lifecycle === 'live' && <StatusPill tone='in'>Playing now</StatusPill>}
						{lifecycle === 'finished' && <StatusPill tone='neutral'>Played</StatusPill>}
					</div>

					<p className='text-muted mb-4 flex items-center gap-1.5 text-sm'>
						<MapPinIcon className='size-4 shrink-0' aria-hidden='true' />
						{game.venue.address ? `${game.venue.name} · ${game.venue.address}` : game.venue.name}
					</p>

					{game.note && <p className='text-muted mb-4 text-sm'>{game.note}</p>}

					<HeadcountBar game={game} season={season} />

					{lifecycle === 'cancelled' ? (
						<p className='text-out mt-5 text-sm'>{game.cancelledReason || 'This game is off.'}</p>
					) : (
						<div className='mt-5'>
							<RespondControl
								status={myResponses[gameId]?.status}
								onRespond={status => respond(gameId, status)}
								onClear={() => clear(gameId)}
								disabled={lifecycle !== 'open'}
							/>
						</div>
					)}
				</section>

				{lifecycle !== 'cancelled' && game.counts.playing >= MIN_TOURNAMENT_PLAYERS && (
					<Link href={`/s/${seasonId}/g/${gameId}/tournament`} className='glass-card block rounded-2xl p-4'>
						<div className='flex items-center gap-3'>
							<TrophyIcon className='text-brand size-5 shrink-0' aria-hidden='true' />
							<div className='min-w-0 flex-1'>
								<p className='text-ink text-sm font-semibold'>Teams</p>
								<p className='text-faint text-xs'>{getFormat(game.counts.playing)}</p>
							</div>
							<ChevronRightIcon className='text-faint size-4 shrink-0' aria-hidden='true' />
						</div>
					</Link>
				)}

				<RosterList
					memberUids={season.memberUids}
					responses={responses}
					usersByUid={usersByUid}
					canManageExtras={isAdmin}
					onToggleExtra={async (uid, confirmed) => {
						await write(
							() => setConfirmOverride(seasonId, gameId, uid, confirmed),
							confirmed ? "Couldn't give them a spot." : "Couldn't drop them."
						);
					}}
				/>
			</div>
		</SeasonShell>
	);
};

export default GamePage;
