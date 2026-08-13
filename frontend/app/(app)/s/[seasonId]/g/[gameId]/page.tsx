'use client';

import { use, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ChevronRightIcon, MapPinIcon, TrophyIcon } from '@heroicons/react/24/outline';
import { getFormat, getGameLifecycle, isWatchable, tallyResponses } from '@shared/game';
import { MIN_TOURNAMENT_PLAYERS } from '@shared/tournament';
import { formatGameDateLong, formatGameTime, formatRelative } from '@shared/format';
import { useSeasonContext } from '../../../../../../components/SeasonProvider';
import { useAuth } from '../../../../../../lib/auth';
import { useResponses, useUsers } from '../../../../../../hooks/useData';
import { useGameWatchers } from '../../../../../../hooks/useGameWatchers';
import { useMyResponses } from '../../../../../../hooks/useMyResponses';
import { useRespond } from '../../../../../../hooks/useRespond';
import { useRespondIntent } from '../../../../../../hooks/useRespondIntent';
import { useWatchGame } from '../../../../../../hooks/useWatchGame';
import { useWrite } from '../../../../../../hooks/useWrite';
import { useNow } from '../../../../../../hooks/useNow';
import { setConfirmOverride } from '../../../../../../lib/db/responses';
import SeasonShell from '../../../../../../components/SeasonShell';
import Skeleton from '../../../../../../components/Skeleton';
import EmptyState from '../../../../../../components/EmptyState';
import GameWatchers from '../../../../../../components/GameWatchers';
import HeadcountBar from '../../../../../../components/HeadcountBar';
import RespondControl from '../../../../../../components/RespondControl';
import RosterList from '../../../../../../components/RosterList';
import StatusPill from '../../../../../../components/StatusPill';
import WatchToggle from '../../../../../../components/WatchToggle';

const GamePage = ({ params }: { params: Promise<{ seasonId: string; gameId: string }> }) => {
	const { gameId } = use(params);
	const { seasonId, season, games, loading, isAdmin, role } = useSeasonContext();
	const { responses, loading: responsesLoading } = useResponses(seasonId, gameId);
	const { users } = useUsers();
	const { myResponses } = useMyResponses();
	const { respond, clear } = useRespond(seasonId, role, myResponses);
	const { watching, canWatch, toggleWatch } = useWatchGame(seasonId, gameId);
	const { user } = useAuth();
	const write = useWrite();
	const now = useNow();

	// The global role, not `isAdmin` from the season — that one is true for a
	// season admin too, and a season admin is still one of the players whose own
	// following is private from the person sitting next to them.
	const isAppAdmin = user?.isAppAdmin === true;

	const rawGame = games.find(candidate => candidate.id === gameId) ?? null;
	const usersByUid = useMemo(() => new Map(users.map(user => [user.uid, user])), [users]);

	// `counts` on the game doc is written by a Cloud Function trigger, so it
	// lags a response write by a round trip (and a cold start, worst case).
	// `responses` here is the same subcollection, subscribed directly, so it
	// carries the local write the instant Firestore echoes it from cache —
	// tallying it ourselves shows the same number `onResponseWrite` will settle
	// on, without waiting for it. Held back until responses have loaded once,
	// so this doesn't flash 0 before the subscription delivers its first snapshot.
	const game = useMemo(
		() => (rawGame && !responsesLoading ? { ...rawGame, counts: tallyResponses(responses) } : rawGame),
		[rawGame, responsesLoading, responses]
	);

	// Both hooks below run before the early returns, so the lifecycle they need
	// is resolved up here — `null` until the game has loaded, which each of them
	// reads as "nothing to do yet".
	const currentLifecycle = season && game ? getGameLifecycle(game, season, now) : null;

	// Arriving from a notification's "I'm in" button. Runs before the early
	// returns below so it isn't skipped while the page is still loading.
	useRespondIntent({
		ready: !loading && !!season && !!game,
		isOpen: currentLifecycle === 'open',
		onRespond: useCallback(status => respond(gameId, status), [respond, gameId]),
	});

	// Who else hears when an answer moves. Gated on the same `isWatchable` as the
	// bell, so the list can't outlive the notifications it describes.
	const watchers = useGameWatchers(
		seasonId,
		gameId,
		isAppAdmin && currentLifecycle !== null && isWatchable(currentLifecycle)
	);

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
					{/* The pills wrap on a narrow phone; the bell stays pinned to the
					    top-right of the card rather than wrapping with them. It sits
					    here, on the game itself, because that is what it follows —
					    every answer on this game, not the roster it happens to be
					    listed in. `isWatchable` is shared with the trigger, so it can
					    never be drawn on a game nothing would arrive about — nor
					    hidden on one that is still sending. */}
					<div className='mb-4 flex items-center justify-between gap-2'>
						<div className='flex flex-wrap items-center gap-2'>
							<span className='text-faint text-xs'>{formatRelative(game.kickoff)}</span>
							{game.isOneOff && <StatusPill tone='extra'>One-off</StatusPill>}
							{lifecycle === 'cancelled' && <StatusPill tone='out'>Cancelled</StatusPill>}
							{lifecycle === 'locked' && <StatusPill tone='neutral'>Answers closed</StatusPill>}
							{lifecycle === 'live' && <StatusPill tone='in'>Playing now</StatusPill>}
							{lifecycle === 'finished' && <StatusPill tone='neutral'>Played</StatusPill>}
						</div>

						{canWatch && isWatchable(lifecycle) && (
							<WatchToggle watching={watching} onChange={toggleWatch} />
						)}
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

				<div>
					<h2 className='text-ink mb-3 px-1 font-semibold'>Who&apos;s playing</h2>

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

				{/* Below the roster, not above it: this is the answer to a question
				    an admin brings to the screen, and everybody else — the whole
				    group, deciding about this game — is who the screen is for. */}
				{isAppAdmin && isWatchable(lifecycle) && (
					<GameWatchers
						uids={watchers.uids}
						usersByUid={usersByUid}
						loading={watchers.loading}
						error={watchers.error}
						onReload={watchers.reload}
					/>
				)}
			</div>
		</SeasonShell>
	);
};

export default GamePage;
