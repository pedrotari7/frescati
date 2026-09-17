'use client';

import { use, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ChevronRightIcon, MapPinIcon, TrophyIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { canReportAbsence, getExtraSpot, getFormat, getGameLifecycle, isWatchable, tallyResponses } from '@shared/game';
import type { AppUser, Game, GameResponse, KitItem, PlayerRole, ResponseStatus, Season } from '@shared/types';
import type { GameLifecycle } from '@shared/game';
import { isShareable } from '@shared/share';
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
import { nudgePlayers, setAbsent, setConfirmOverride } from '../../../../../../lib/db/responses';
import { displayNameOf } from '../../../../../../lib/people';
import SeasonShell from '../../../../../../components/SeasonShell';
import Skeleton from '../../../../../../components/Skeleton';
import EmptyState from '../../../../../../components/EmptyState';
import ExtraSpotNote from '../../../../../../components/ExtraSpotNote';
import LoadFailed from '../../../../../../components/LoadFailed';
import GameKit from '../../../../../../components/GameKit';
import GameWatchers from '../../../../../../components/GameWatchers';
import HeadcountBar from '../../../../../../components/HeadcountBar';
import type { DebtLock } from '../../../../../../components/RespondControl';
import RespondControl from '../../../../../../components/RespondControl';
import RosterList from '../../../../../../components/RosterList';
import ShareGame from '../../../../../../components/ShareGame';
import StatusPill from '../../../../../../components/StatusPill';
import { useToast } from '../../../../../../components/Toast';
import WatchToggle from '../../../../../../components/WatchToggle';
import { colors } from '../../../../../tokens.stylex';
import { surfaces } from '../../../../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 24, padding: 16 },
	card: { borderRadius: 24, padding: 20 },

	/* The pills wrap; the bell does not. See the comment at the call site. */
	top: { marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	pills: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
	/* The two icon buttons as one block, so the pills wrap against the pair
	   rather than between them. Both carry their own negative margin. */
	tools: { display: 'flex', alignItems: 'center', flexShrink: 0 },
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

/** Why there is no game to show, drawn as the screen. Below a tab, so it keeps a chevron. */
const NoGame = ({
	reason,
	backHref,
	onRetry,
}: {
	reason: 'loading' | 'error' | 'missing';
	backHref: string;
	onRetry: () => void;
}) => (
	<SeasonShell title='Game' backHref={backHref}>
		{reason === 'loading' && <Skeleton />}
		{reason === 'error' && <LoadFailed what='this game' onRetry={onRetry} />}
		{reason === 'missing' && (
			<EmptyState title='Game not found' message='It may have been deleted from the calendar.' />
		)}
	</SeasonShell>
);

/**
 * What state the game is in, and the two things you can do with it that are not
 * answering.
 *
 * The pills wrap on a narrow phone; the bell stays pinned to the top-right of
 * the card rather than wrapping with them. It sits here, on the game itself,
 * because that is what it follows: every answer on this game, not the roster it
 * happens to be listed in. `isWatchable` is shared with the trigger, so the
 * bell can never be drawn on a game nothing would arrive about, nor hidden on
 * one that is still sending. Share is still drawn on a game that is off, where
 * the bell beside it is not: the bell follows answers nobody is giving any
 * more, and this passes on the one fact everybody needs.
 */
const CardTop = ({
	game,
	season,
	lifecycle,
	watch,
}: {
	game: Game;
	season: Season;
	lifecycle: GameLifecycle;
	watch?: { watching: boolean; onChange: (next: boolean) => void };
}) => (
	<div {...stylex.props(styles.top)}>
		<div {...stylex.props(styles.pills)}>
			<span {...stylex.props(styles.when)}>{formatRelative(game.kickoff)}</span>
			{game.isOneOff && <StatusPill tone='extra'>One-off</StatusPill>}
			{lifecycle === 'cancelled' && <StatusPill tone='out'>Cancelled</StatusPill>}
			{lifecycle === 'locked' && <StatusPill tone='neutral'>Answers closed</StatusPill>}
			{lifecycle === 'live' && <StatusPill tone='in'>Playing now</StatusPill>}
			{lifecycle === 'finished' && <StatusPill tone='neutral'>Played</StatusPill>}
		</div>

		<div {...stylex.props(styles.tools)}>
			{isShareable(lifecycle) && <ShareGame game={game} season={season} />}
			{watch && isWatchable(lifecycle) && <WatchToggle watching={watch.watching} onChange={watch.onChange} />}
		</div>
	</div>
);

/**
 * The answer, and the receipt for it.
 *
 * `ExtraSpotNote` is the same note the season's home card draws, because the tap
 * happens on both screens and the answer to "did that work?" has to be where it
 * was asked. The roster below says the same thing about an extra, but beside
 * their own name in a list they have to find themselves in.
 */
const Answer = ({
	game,
	lifecycle,
	myResponse,
	isExtra,
	debtLock,
	onRespond,
	onClear,
}: {
	game: Game;
	lifecycle: GameLifecycle;
	myResponse: GameResponse | undefined;
	isExtra: boolean;
	debtLock?: DebtLock;
	onRespond: (status: ResponseStatus) => Promise<void>;
	onClear: () => Promise<void>;
}) => {
	if (lifecycle === 'cancelled') {
		return <p {...stylex.props(styles.off)}>{game.cancelledReason || 'This game is off.'}</p>;
	}

	return (
		<div {...stylex.props(styles.respond)}>
			<RespondControl
				response={myResponse}
				onRespond={onRespond}
				onClear={onClear}
				disabled={lifecycle !== 'open'}
				debtLock={debtLock}
			/>

			<ExtraSpotNote isExtra={isExtra} myResponse={myResponse} lifecycle={lifecycle} />
		</div>
	);
};

/** Everything about the game itself: when, where, how many, and your answer. */
const GameCard = ({
	game,
	season,
	lifecycle,
	played,
	myResponse,
	isExtra,
	debtLock,
	watch,
	onRespond,
	onClear,
}: {
	game: Game;
	season: Season;
	lifecycle: GameLifecycle;
	played: boolean;
	myResponse: GameResponse | undefined;
	isExtra: boolean;
	debtLock?: DebtLock;
	watch?: { watching: boolean; onChange: (next: boolean) => void };
	onRespond: (status: ResponseStatus) => Promise<void>;
	onClear: () => Promise<void>;
}) => (
	<section {...stylex.props(surfaces.glass, styles.card)}>
		<CardTop game={game} season={season} lifecycle={lifecycle} watch={watch} />

		<p {...stylex.props(styles.where)}>
			<MapPinIcon {...stylex.props(styles.pin)} aria-hidden='true' />
			{game.venue.address ? `${game.venue.name} · ${game.venue.address}` : game.venue.name}
		</p>

		{game.note && <p {...stylex.props(styles.note)}>{game.note}</p>}

		<HeadcountBar game={game} season={season} played={played} />

		<Answer
			game={game}
			lifecycle={lifecycle}
			myResponse={myResponse}
			isExtra={isExtra}
			debtLock={debtLock}
			onRespond={onRespond}
			onClear={onClear}
		/>
	</section>
);

/**
 * The way through to the team sheet, once there are enough people for one.
 *
 * Hidden on a game that is off, where there is nothing to pick teams for.
 * Drawn on one that is finished, because that is where the result is.
 */
const TeamsLink = ({ href, playing, lifecycle }: { href: string; playing: number; lifecycle: GameLifecycle }) => {
	if (lifecycle === 'cancelled' || playing < MIN_TOURNAMENT_PLAYERS) return null;

	return (
		<Link href={href} {...stylex.props(surfaces.glassCard, styles.teams)}>
			<div {...stylex.props(styles.teamsRow)}>
				<TrophyIcon {...stylex.props(styles.trophy)} aria-hidden='true' />
				<div {...stylex.props(styles.teamsBody)}>
					<p {...stylex.props(styles.teamsTitle)}>Teams</p>
					<p {...stylex.props(styles.format)}>{getFormat(playing)}</p>
				</div>
				<ChevronRightIcon {...stylex.props(styles.chevron)} aria-hidden='true' />
			</div>
		</Link>
	);
};

/**
 * Asking one person for an answer.
 *
 * Offered only while the game can still be answered. Past the deadline this
 * asks a question the app will not take an answer to, and the callable refuses
 * one anyway, so offering the button would be offering an error.
 *
 * The result is worth saying while the admin is still looking at the screen. A
 * nudge that reached nobody looks exactly like one that worked, and the
 * alternative is waiting a day for an answer nobody was ever asked for.
 */
const useNudge = (seasonId: string, gameId: string, usersByUid: Map<string, AppUser>) => {
	const write = useWrite();
	const { notify } = useToast();

	return async (uid: string) => {
		const name = displayNameOf(usersByUid.get(uid));

		return write(async () => {
			const { pushed, emailed } = await nudgePlayers(seasonId, gameId, [uid]);

			notify(pushed + emailed > 0 ? `Asked ${name}.` : `The app cannot reach ${name}.`);
		}, `Couldn't nudge ${name}.`);
	};
};

/** Who's playing, and the three things an admin can do about it from here. */
const Roster = ({
	seasonId,
	gameId,
	memberUids,
	responses,
	usersByUid,
	isAdmin,
	lifecycle,
	played,
}: {
	seasonId: string;
	gameId: string;
	memberUids: string[];
	responses: GameResponse[];
	usersByUid: Map<string, AppUser>;
	isAdmin: boolean;
	lifecycle: GameLifecycle;
	played: boolean;
}) => {
	const write = useWrite();
	const nudge = useNudge(seasonId, gameId, usersByUid);

	return (
		<div>
			<h2 {...stylex.props(styles.rosterHead)}>{played ? 'Who played' : "Who's playing"}</h2>

			<RosterList
				memberUids={memberUids}
				responses={responses}
				usersByUid={usersByUid}
				canManageExtras={isAdmin}
				canReportAbsence={isAdmin && canReportAbsence(lifecycle)}
				played={played}
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
				onNudge={isAdmin && lifecycle === 'open' ? nudge : undefined}
			/>
		</div>
	);
};

/**
 * Arriving from a notification's "I'm in" button.
 *
 * Called before the page's early returns so it is not skipped while the screen
 * is still loading, which is why everything it needs is resolved as nullable up
 * there and it reads a `false` `ready` as "nothing to do yet".
 */
const useInFromPush = ({
	gameId,
	ready,
	isOpen,
	role,
	myResponse,
	debtLock,
	onRespond,
}: {
	gameId: string;
	ready: boolean;
	isOpen: boolean;
	role: PlayerRole;
	myResponse: GameResponse | undefined;
	debtLock?: DebtLock;
	onRespond: (gameId: string, status: ResponseStatus) => Promise<void>;
}) => {
	useRespondIntent({
		ready,
		isOpen,
		// What an In from that button will actually land as. Both halves are here
		// and nowhere else: the role it is recorded under, and whether an admin has
		// already waved this person through on this game, an extra who was
		// confirmed, said Out and is now changing their mind back keeps the spot
		// they were given, because `setResponse` preserves it.
		pendingSpot: getExtraSpot({ status: 'in', role, confirmOverride: myResponse?.confirmOverride }) === 'pending',
		// The same lock the buttons on the card draw, on the one path into an In
		// that never sees them.
		blockedByDebt: !!debtLock,
		onRespond: useCallback(status => onRespond(gameId, status), [onRespond, gameId]),
	});
};

/**
 * What somebody still has to bring, directly under the headcount, because it is
 * the same question: whether this game can actually go ahead.
 *
 * Hidden once the game is off or over. Spelled out rather than borrowing
 * `isWatchable`, which answers a question about notifications and only happens
 * to agree. There is nobody left to hand a ball to on a game that has finished.
 */
const KitNeeded = ({
	seasonId,
	items,
	responses,
	usersByUid,
	lifecycle,
}: {
	seasonId: string;
	items: KitItem[];
	responses: GameResponse[];
	usersByUid: Map<string, AppUser>;
	lifecycle: GameLifecycle;
}) => {
	if (lifecycle === 'cancelled' || lifecycle === 'finished') return null;

	return <GameKit seasonId={seasonId} items={items} responses={responses} usersByUid={usersByUid} />;
};

/**
 * Who else hears when an answer moves.
 *
 * Below the roster, not above it: this is the answer to a question an admin
 * brings to the screen, and everybody else, the whole group deciding about this
 * game, is who the screen is for.
 */
const Watchers = ({
	watchers,
	usersByUid,
	show,
}: {
	watchers: ReturnType<typeof useGameWatchers>;
	usersByUid: Map<string, AppUser>;
	show: boolean;
}) => {
	if (!show) return null;

	return (
		<GameWatchers
			uids={watchers.uids}
			usersByUid={usersByUid}
			loading={watchers.loading}
			error={watchers.error}
			onReload={watchers.reload}
		/>
	);
};

/**
 * The game, with its headcount counted here rather than read off the document.
 *
 * `counts` on the game doc is written by a Cloud Function trigger, so it lags a
 * response write by a round trip, and a cold start in the worst case.
 * `responses` is the same subcollection subscribed directly, so it carries the
 * local write the instant Firestore echoes it from cache; tallying it here shows
 * the same number `onResponseWrite` will settle on, without waiting for it.
 *
 * Held back until responses have loaded once, so this does not flash 0 before
 * the subscription delivers its first snapshot.
 */
const useTalliedGame = (games: Game[], gameId: string, responses: GameResponse[], responsesLoading: boolean) => {
	const rawGame = games.find(candidate => candidate.id === gameId) ?? null;

	return useMemo(
		() => (rawGame && !responsesLoading ? { ...rawGame, counts: tallyResponses(responses) } : rawGame),
		[rawGame, responsesLoading, responses]
	);
};

/**
 * The bell for this game, or nothing at all where nobody is signed in to ring
 * it. `canWatch` is the cue to draw no bell rather than a dead one.
 */
const useBell = (seasonId: string, gameId: string) => {
	const { isWatching, canWatch, toggleWatch } = useWatchGames(seasonId);

	return canWatch
		? { watching: isWatching(gameId), onChange: (next: boolean) => toggleWatch(gameId, next) }
		: undefined;
};

/**
 * Everything this screen reads, and the two hooks that have to run before it can
 * decide whether there is anything to draw.
 *
 * All of it sits above the page's early returns on purpose. The notification
 * intent and the watcher list would both be skipped while the screen was still
 * loading, and the first of those is the whole path in from a push, so the
 * lifecycle they need is resolved here as `null` until the game has landed,
 * which each of them reads as "nothing to do yet".
 */
const useGameScreen = (gameId: string) => {
	const { seasonId, season, games, myResponses, loading, error, retry, isAdmin, role, debtLock } = useSeasonContext();
	const { responses, loading: responsesLoading } = useResponses(seasonId, gameId);
	const { kit } = useKit(seasonId);
	const { usersByUid } = useUsersByUid();
	const { respond, clear } = useRespond(seasonId, role, myResponses);
	const watch = useBell(seasonId, gameId);
	const { user } = useAuth();
	const now = useNow();
	const game = useTalliedGame(games, gameId, responses, responsesLoading);

	// The global role, not `isAdmin` from the season, that one is true for a
	// season admin too, and a season admin is still one of the players whose own
	// following is private from the person sitting next to them.
	const isAppAdmin = user?.isAppAdmin === true;

	const currentLifecycle = season && game ? getGameLifecycle(game, season, now) : null;

	useInFromPush({
		gameId,
		ready: !loading && !!season && !!game,
		isOpen: currentLifecycle === 'open',
		role,
		myResponse: myResponses[gameId],
		debtLock,
		onRespond: respond,
	});

	// Who else hears when an answer moves. Gated on the same `isWatchable` as the
	// bell, so the list cannot outlive the notifications it describes.
	const watchers = useGameWatchers(
		seasonId,
		gameId,
		isAppAdmin && currentLifecycle !== null && isWatchable(currentLifecycle)
	);

	return {
		seasonId,
		season,
		game,
		responses,
		kit,
		usersByUid,
		myResponses,
		loading,
		error,
		retry,
		isAdmin,
		isAppAdmin,
		role,
		debtLock,
		now,
		watchers,
		respond,
		clear,
		watch,
	};
};

const GamePage = ({ params }: { params: Promise<{ seasonId: string; gameId: string }> }) => {
	const { gameId } = use(params);
	const {
		seasonId,
		season,
		game,
		responses,
		kit,
		usersByUid,
		myResponses,
		loading,
		error,
		retry,
		isAdmin,
		isAppAdmin,
		role,
		debtLock,
		now,
		watchers,
		respond,
		clear,
		watch,
	} = useGameScreen(gameId);

	const home = `/s/${seasonId}`;

	if (loading) return <NoGame reason='loading' backHref={home} onRetry={retry} />;
	if (error) return <NoGame reason='error' backHref={home} onRetry={retry} />;
	if (!season || !game) return <NoGame reason='missing' backHref={home} onRetry={retry} />;

	const lifecycle = getGameLifecycle(game, season, now);
	const timezone = season.slot.timezone;

	// Past the final whistle nothing on this screen is a question any more. The
	// headcount, the roster heading and the groups inside it all read as one
	// until then, so each of them says what happened instead.
	const played = lifecycle === 'finished';

	return (
		<SeasonShell
			title={formatGameDateLong(game.kickoff, timezone)}
			subtitle={`${formatGameTime(game.kickoff, timezone)} · ${game.venue.name}`}
			backHref={`/s/${seasonId}`}
		>
			<div {...stylex.props(styles.page)}>
				<GameCard
					game={game}
					season={season}
					lifecycle={lifecycle}
					played={played}
					myResponse={myResponses[gameId]}
					isExtra={role === 'extra'}
					debtLock={debtLock}
					watch={watch}
					onRespond={status => respond(gameId, status)}
					onClear={() => clear(gameId)}
				/>

				<KitNeeded
					seasonId={seasonId}
					items={kit}
					responses={responses}
					usersByUid={usersByUid}
					lifecycle={lifecycle}
				/>

				<TeamsLink
					href={`${home}/g/${gameId}/tournament`}
					playing={game.counts.playing}
					lifecycle={lifecycle}
				/>

				<Roster
					seasonId={seasonId}
					gameId={gameId}
					memberUids={season.memberUids}
					responses={responses}
					usersByUid={usersByUid}
					isAdmin={isAdmin}
					lifecycle={lifecycle}
					played={played}
				/>

				<Watchers watchers={watchers} usersByUid={usersByUid} show={isAppAdmin && isWatchable(lifecycle)} />
			</div>
		</SeasonShell>
	);
};

export default GamePage;
