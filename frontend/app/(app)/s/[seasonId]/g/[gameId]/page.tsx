'use client';

import { use, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ChevronRightIcon, MapPinIcon, TrophyIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { canReportAbsence, getExtraSpot, getFormat, getGameLifecycle, isWatchable, tallyResponses } from '@shared/game';
import { MIN_TOURNAMENT_PLAYERS } from '@shared/tournament';
import { formatGameDateLong, formatGameTime, formatRelative } from '@shared/format';
import { useSeasonContext } from '../../../../../../components/SeasonProvider';
import { useAuth } from '../../../../../../lib/auth';
import { useKit, useResponses, useUsersByUid } from '../../../../../../hooks/useData';
import { useGameWatchers } from '../../../../../../hooks/useGameWatchers';
import { useRespond } from '../../../../../../hooks/useRespond';
import { useRespondIntent } from '../../../../../../hooks/useRespondIntent';
import { useWatchGames } from '../../../../../../hooks/useWatchGames';
import { useWrite } from '../../../../../../hooks/useWrite';
import { useNow } from '../../../../../../hooks/useNow';
import { setAbsent, setConfirmOverride } from '../../../../../../lib/db/responses';
import SeasonShell from '../../../../../../components/SeasonShell';
import Skeleton from '../../../../../../components/Skeleton';
import EmptyState from '../../../../../../components/EmptyState';
import ExtraSpotNote from '../../../../../../components/ExtraSpotNote';
import LoadFailed from '../../../../../../components/LoadFailed';
import GameKit from '../../../../../../components/GameKit';
import GameWatchers from '../../../../../../components/GameWatchers';
import HeadcountBar from '../../../../../../components/HeadcountBar';
import RespondControl from '../../../../../../components/RespondControl';
import RosterList from '../../../../../../components/RosterList';
import StatusPill from '../../../../../../components/StatusPill';
import WatchToggle from '../../../../../../components/WatchToggle';
import { colors } from '../../../../../tokens.stylex';
import { surfaces } from '../../../../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 24, padding: 16 },
	card: { borderRadius: 24, padding: 20 },

	/* The pills wrap; the bell does not. See the comment at the call site. */
	top: { marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	pills: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
	when: { color: colors.faint, fontSize: 12, lineHeight: '16px' },

	where: {
		color: colors.muted,
		marginBottom: 16,
		display: 'flex',
		alignItems: 'center',
		gap: 6,
		fontSize: 14,
		lineHeight: '20px',
	},
	pin: { width: 16, height: 16, flexShrink: 0 },
	note: { color: colors.muted, marginBottom: 16, fontSize: 14, lineHeight: '20px' },
	off: { color: colors.out, marginTop: 20, fontSize: 14, lineHeight: '20px' },
	respond: { marginTop: 20 },

	teams: { display: 'block', borderRadius: 16, padding: 16 },
	teamsRow: { display: 'flex', alignItems: 'center', gap: 12 },
	trophy: { color: colors.brand, width: 20, height: 20, flexShrink: 0 },
	teamsBody: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	teamsTitle: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	format: { color: colors.faint, fontSize: 12, lineHeight: '16px' },
	chevron: { color: colors.faint, width: 16, height: 16, flexShrink: 0 },

	rosterHead: {
		color: colors.ink,
		marginBottom: 12,
		paddingInline: 4,
		fontSize: 16,
		lineHeight: '24px',
		fontWeight: 600,
	},
});

const GamePage = ({ params }: { params: Promise<{ seasonId: string; gameId: string }> }) => {
	const { gameId } = use(params);
	const { seasonId, season, games, myResponses, loading, error, retry, isAdmin, role, debtLock } = useSeasonContext();
	const { responses, loading: responsesLoading } = useResponses(seasonId, gameId);
	const { kit } = useKit(seasonId);
	const { usersByUid } = useUsersByUid();
	const { respond, clear } = useRespond(seasonId, role, myResponses);
	const { isWatching, canWatch, toggleWatch } = useWatchGames(seasonId);
	const { user } = useAuth();
	const write = useWrite();
	const now = useNow();

	// The global role, not `isAdmin` from the season, that one is true for a
	// season admin too, and a season admin is still one of the players whose own
	// following is private from the person sitting next to them.
	const isAppAdmin = user?.isAppAdmin === true;

	const rawGame = games.find(candidate => candidate.id === gameId) ?? null;

	// `counts` on the game doc is written by a Cloud Function trigger, so it
	// lags a response write by a round trip (and a cold start, worst case).
	// `responses` here is the same subcollection, subscribed directly, so it
	// carries the local write the instant Firestore echoes it from cache,
	// tallying it ourselves shows the same number `onResponseWrite` will settle
	// on, without waiting for it. Held back until responses have loaded once,
	// so this doesn't flash 0 before the subscription delivers its first snapshot.
	const game = useMemo(
		() => (rawGame && !responsesLoading ? { ...rawGame, counts: tallyResponses(responses) } : rawGame),
		[rawGame, responsesLoading, responses]
	);

	// Both hooks below run before the early returns, so the lifecycle they need
	// is resolved up here: `null` until the game has loaded, which each of them
	// reads as "nothing to do yet".
	const currentLifecycle = season && game ? getGameLifecycle(game, season, now) : null;

	// Arriving from a notification's "I'm in" button. Runs before the early
	// returns below so it isn't skipped while the page is still loading.
	useRespondIntent({
		ready: !loading && !!season && !!game,
		isOpen: currentLifecycle === 'open',
		// What an In from that button will actually land as. Both halves are
		// here and nowhere else: the role it is recorded under, and whether an
		// admin has already waved this person through on this game, an extra
		// who was confirmed, said Out and is now changing their mind back keeps
		// the spot they were given, because `setResponse` preserves it.
		pendingSpot:
			getExtraSpot({ status: 'in', role, confirmOverride: myResponses[gameId]?.confirmOverride }) === 'pending',
		// The same lock the buttons below draw, on the one path into an In that
		// never sees them.
		blockedByDebt: !!debtLock,
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

	if (error) {
		return (
			<SeasonShell title='Game' backHref={`/s/${seasonId}`}>
				<LoadFailed what='this game' onRetry={retry} />
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
			<div {...stylex.props(styles.page)}>
				<section {...stylex.props(surfaces.glass, styles.card)}>
					{/* The pills wrap on a narrow phone; the bell stays pinned to the
					    top-right of the card rather than wrapping with them. It sits
					    here, on the game itself, because that is what it follows,
					    every answer on this game, not the roster it happens to be
					    listed in. `isWatchable` is shared with the trigger, so it can
					    never be drawn on a game nothing would arrive about, nor
					    hidden on one that is still sending. */}
					<div {...stylex.props(styles.top)}>
						<div {...stylex.props(styles.pills)}>
							<span {...stylex.props(styles.when)}>{formatRelative(game.kickoff)}</span>
							{game.isOneOff && <StatusPill tone='extra'>One-off</StatusPill>}
							{lifecycle === 'cancelled' && <StatusPill tone='out'>Cancelled</StatusPill>}
							{lifecycle === 'locked' && <StatusPill tone='neutral'>Answers closed</StatusPill>}
							{lifecycle === 'live' && <StatusPill tone='in'>Playing now</StatusPill>}
							{lifecycle === 'finished' && <StatusPill tone='neutral'>Played</StatusPill>}
						</div>

						{canWatch && isWatchable(lifecycle) && (
							<WatchToggle watching={isWatching(gameId)} onChange={watch => toggleWatch(gameId, watch)} />
						)}
					</div>

					<p {...stylex.props(styles.where)}>
						<MapPinIcon {...stylex.props(styles.pin)} aria-hidden='true' />
						{game.venue.address ? `${game.venue.name} · ${game.venue.address}` : game.venue.name}
					</p>

					{game.note && <p {...stylex.props(styles.note)}>{game.note}</p>}

					<HeadcountBar game={game} season={season} />

					{lifecycle === 'cancelled' ? (
						<p {...stylex.props(styles.off)}>{game.cancelledReason || 'This game is off.'}</p>
					) : (
						<div {...stylex.props(styles.respond)}>
							<RespondControl
								response={myResponses[gameId]}
								onRespond={status => respond(gameId, status)}
								onClear={() => clear(gameId)}
								disabled={lifecycle !== 'open'}
								debtLock={debtLock}
							/>

							{/* The same note the season's home card draws, because
							    the tap happens on both screens and the answer to
							    "did that work?" has to be where it was asked. The
							    roster below says the same thing about an extra, but
							    beside their own name in a list they have to find
							    themselves in. */}
							<ExtraSpotNote
								isExtra={role === 'extra'}
								myResponse={myResponses[gameId]}
								lifecycle={lifecycle}
							/>
						</div>
					)}
				</section>

				{/* Directly under the headcount, because it is the same question:
				    whether this game can actually go ahead. Hidden once it is off
				    or over. Spelled out rather than borrowing `isWatchable`,
				    which answers a question about notifications and only happens
				    to agree. There is nobody left to hand a ball to on a game
				    that has finished. */}
				{lifecycle !== 'cancelled' && lifecycle !== 'finished' && (
					<GameKit seasonId={seasonId} items={kit} responses={responses} usersByUid={usersByUid} />
				)}

				{lifecycle !== 'cancelled' && game.counts.playing >= MIN_TOURNAMENT_PLAYERS && (
					<Link
						href={`/s/${seasonId}/g/${gameId}/tournament`}
						{...stylex.props(surfaces.glassCard, styles.teams)}
					>
						<div {...stylex.props(styles.teamsRow)}>
							<TrophyIcon {...stylex.props(styles.trophy)} aria-hidden='true' />
							<div {...stylex.props(styles.teamsBody)}>
								<p {...stylex.props(styles.teamsTitle)}>Teams</p>
								<p {...stylex.props(styles.format)}>{getFormat(game.counts.playing)}</p>
							</div>
							<ChevronRightIcon {...stylex.props(styles.chevron)} aria-hidden='true' />
						</div>
					</Link>
				)}

				<div>
					<h2 {...stylex.props(styles.rosterHead)}>Who&apos;s playing</h2>

					<RosterList
						memberUids={season.memberUids}
						responses={responses}
						usersByUid={usersByUid}
						canManageExtras={isAdmin}
						canReportAbsence={isAdmin && canReportAbsence(lifecycle)}
						onToggleExtra={async (uid, confirmed) => {
							await write(
								() => setConfirmOverride(seasonId, gameId, uid, confirmed),
								confirmed ? "Couldn't give them a spot." : "Couldn't drop them."
							);
						}}
						onToggleAbsent={async (uid, absent) => {
							await write(
								() => setAbsent(seasonId, gameId, uid, absent),
								absent ? "Couldn't mark them as a no-show." : "Couldn't take that back."
							);
						}}
					/>
				</div>

				{/* Below the roster, not above it: this is the answer to a question
				    an admin brings to the screen, and everybody else, the whole
				    group, deciding about this game, is who the screen is for. */}
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
