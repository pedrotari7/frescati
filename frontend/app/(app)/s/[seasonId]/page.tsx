'use client';

import { useMemo, useState } from 'react';
import { CalendarDaysIcon, CalendarIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { Game, GameResponse, ResponseStatus, Season } from '@shared/types';
import { groupGames } from '@shared/game';
import { useSeasonContext } from '../../../../components/SeasonProvider';
import { useAuth } from '../../../../lib/auth';
import { useRespond } from '../../../../hooks/useRespond';
import { useWatchGames } from '../../../../hooks/useWatchGames';
import { useLiveGameRedirect } from '../../../../hooks/useLiveGameRedirect';
import { useNow } from '../../../../hooks/useNow';
import SeasonShell from '../../../../components/SeasonShell';
import Skeleton from '../../../../components/Skeleton';
import EmptyState from '../../../../components/EmptyState';
import LoadFailed from '../../../../components/LoadFailed';
import NextGameHero from '../../../../components/NextGameHero';
import GameRow from '../../../../components/GameRow';
import type { DebtLock } from '../../../../components/RespondControl';
import MotmVoteCallout from '../../../../components/MotmVoteCallout';
import SeasonDebtNotice from '../../../../components/SeasonDebtNotice';
import Button from '../../../../components/Button';
import CalendarSubscribeSheet from '../../../../components/CalendarSubscribeSheet';
import PlayedSection from '../../../../components/PlayedSection';
import { SectionHeading } from '../../../../components/Section';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 24, padding: 16 },
	calendar: { width: 16, height: 16 },
	heading: { marginBottom: 12, paddingInline: 4 },
	/* A column with gaps rather than `space-y`, which has no StyleX equivalent:
	   there is no sibling selector to hang it on. */
	rows: { display: 'flex', flexDirection: 'column', gap: 8 },
	/* The gap under the Played heading, above a stack of game cards. */
	playedHead: { marginBottom: 12 },
});

/**
 * Everything a game row needs that is the same for every game on this screen.
 *
 * Bundled rather than threaded one prop at a time, because the two lists below
 * differ in exactly one thing, whether the games in them can still be followed,
 * and a shape that says so keeps that the only difference.
 */
interface Answering {
	season: Season;
	myResponses: Record<string, GameResponse | undefined>;
	debtLock?: DebtLock;
	now: Date;
	onRespond: (gameId: string, status: ResponseStatus) => Promise<void>;
	onClear: (gameId: string) => Promise<void>;
}

/** Following games, where somebody is signed in to follow them. */
interface Watching {
	isWatching: (gameId: string) => boolean;
	toggle: (gameId: string, next: boolean) => void;
}

/** Why there is no season home yet, drawn as the screen. A tab root, so no chevron. */
const NoHome = ({ reason, onRetry }: { reason: 'loading' | 'error' | 'missing'; onRetry: () => void }) => (
	<SeasonShell title={reason === 'missing' ? 'Season' : 'Frescati'}>
		{reason === 'loading' && <Skeleton />}
		{reason === 'error' && <LoadFailed what='this season' onRetry={onRetry} />}
		{reason === 'missing' && (
			<EmptyState title='Season not found' message='It may have been deleted, or the link is wrong.' />
		)}
	</SeasonShell>
);

/**
 * The next game, or the reason there isn't one, which reads differently to the
 * person who can do something about it.
 */
const NextUp = ({
	next,
	answering,
	isExtra,
	isAdmin,
	watch,
}: {
	next: Game | null;
	answering: Answering;
	isExtra: boolean;
	isAdmin: boolean;
	watch?: Watching;
}) => {
	if (!next) {
		return (
			<EmptyState
				icon={<CalendarDaysIcon />}
				title='No games scheduled'
				message={
					isAdmin
						? 'Generate the season calendar from the admin settings.'
						: 'Nothing on the calendar yet. An admin will add games soon.'
				}
			/>
		);
	}

	return (
		<NextGameHero
			game={next}
			season={answering.season}
			myResponse={answering.myResponses[next.id]}
			isExtra={isExtra}
			watching={watch ? watch.isWatching(next.id) : false}
			debtLock={answering.debtLock}
			now={answering.now}
			onRespond={status => answering.onRespond(next.id, status)}
			onClear={() => answering.onClear(next.id)}
			onWatchChange={watch && (following => watch.toggle(next.id, following))}
		/>
	);
};

/** A stack of games, with a bell on them only where one would do anything. */
const GameRows = ({ games, answering, watch }: { games: Game[]; answering: Answering; watch?: Watching }) => (
	<div {...stylex.props(styles.rows)}>
		{games.map(game => (
			<GameRow
				key={game.id}
				game={game}
				season={answering.season}
				myResponse={answering.myResponses[game.id]}
				watching={watch ? watch.isWatching(game.id) : false}
				debtLock={answering.debtLock}
				now={answering.now}
				onRespond={status => answering.onRespond(game.id, status)}
				onClear={() => answering.onClear(game.id)}
				onWatchChange={watch && (following => watch.toggle(game.id, following))}
			/>
		))}
	</div>
);

/**
 * The votes still open, straight under the next game, because they are the only
 * things on this screen with a deadline on them and the only ones that go away
 * unanswered. Above Subscribe to calendar, which is here every week where this
 * is here for two days.
 *
 * Each is a card with a way in rather than a row with a pill, and it leads to
 * the team sheet, where the ballot is and where the notification about it lands.
 * The game page is a headcount for a game already played.
 */
const VotingSection = ({ games, season, now }: { games: Game[]; season: Season; now: Date }) => {
	if (games.length === 0) return null;

	return (
		<section>
			<SectionHeading sx={styles.heading}>Man of the match</SectionHeading>
			<div {...stylex.props(styles.rows)}>
				{games.map(game => (
					<MotmVoteCallout key={game.id} game={game} season={season} now={now} />
				))}
			</div>
		</section>
	);
};

/**
 * The games still to come, and the only list here handed a bell.
 *
 * `voting` and `played` are finished by construction, the same fact
 * `isWatchable` reads to refuse one, so a game already behind us would draw
 * nothing with the props anyway.
 */
const ComingUp = ({ games, answering, watch }: { games: Game[]; answering: Answering; watch?: Watching }) => {
	if (games.length === 0) return null;

	return (
		<section>
			<SectionHeading sx={styles.heading}>Coming up</SectionHeading>
			<GameRows games={games} answering={answering} watch={watch} />
		</section>
	);
};

const SeasonHomePage = () => {
	const { seasonId, season, games, myResponses, loading, error, retry, isAdmin, role, debt, debtLock } =
		useSeasonContext();
	const { user } = useAuth();
	const { respond, clear } = useRespond(seasonId, role, myResponses);

	// One listener for the whole calendar, which is what lets the bell leave the
	// hero and reach every game still to come. The rows below are deliberately fed
	// by the denormalised `counts` rather than a subscription each, and a hook per
	// row would put back exactly the listener-per-row that arrangement exists to
	// avoid, so this asks once, for every game followed anywhere.
	const { isWatching, canWatch, toggleWatch } = useWatchGames(seasonId);
	const watch = canWatch ? { isWatching, toggle: toggleWatch } : undefined;
	const [showPast, setShowPast] = useState(false);
	const [subscribeOpen, setSubscribeOpen] = useState(false);
	const now = useNow();

	// This is the screen the app lands on, so it's where somebody arriving during
	// a game they're playing in gets taken to it. Above the early returns, so a
	// slow first snapshot doesn't skip it. It waits for `ready` instead.
	useLiveGameRedirect({
		seasonId,
		season,
		games,
		myResponses,
		ready: !loading,
	});

	const { next, upcoming, voting, played } = useMemo(
		() => (season ? groupGames(games, now) : { next: null, upcoming: [], voting: [], played: [] }),
		[games, season, now]
	);

	if (loading) return <NoHome reason='loading' onRetry={retry} />;
	if (error) return <NoHome reason='error' onRetry={retry} />;
	if (!season) return <NoHome reason='missing' onRetry={retry} />;

	const answering = { season, myResponses, debtLock, now, onRespond: respond, onClear: clear };

	return (
		<>
			<SeasonShell title={season.name} subtitle={season.venue.name}>
				<div {...stylex.props(styles.page)}>
					{/* First on the screen, and above the card whose In button it
					    explains. Not instead of the games: hiding the calendar
					    collects nothing and takes away what somebody needs in order
					    to decide whether paying is worth it. */}
					<SeasonDebtNotice debt={debt} season={season} games={games} displayName={user?.displayName ?? ''} />

					<NextUp
						next={next}
						answering={answering}
						isExtra={role === 'extra'}
						isAdmin={isAdmin}
						watch={watch}
					/>

					<VotingSection games={voting} season={season} now={now} />

					<Button variant='ghost' size='sm' onClick={() => setSubscribeOpen(true)}>
						<CalendarIcon {...stylex.props(styles.calendar)} aria-hidden='true' />
						Subscribe to calendar
					</Button>

					{/* Above the games still to come, so the last result sits beside
					    the vote that may still be running on it. */}
					<PlayedSection
						count={played.length}
						open={showPast}
						onToggle={() => setShowPast(!showPast)}
						sx={styles.playedHead}
					>
						<GameRows games={played} answering={answering} />
					</PlayedSection>

					<ComingUp games={upcoming} answering={answering} watch={watch} />
				</div>
			</SeasonShell>

			<CalendarSubscribeSheet seasonId={seasonId} open={subscribeOpen} onClose={() => setSubscribeOpen(false)} />
		</>
	);
};

export default SeasonHomePage;
