'use client';

import { useMemo, useState } from 'react';
import { CalendarDaysIcon, CalendarIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
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

	if (loading) {
		return (
			<SeasonShell title='Frescati'>
				<Skeleton />
			</SeasonShell>
		);
	}

	if (error) {
		return (
			<SeasonShell title='Frescati'>
				<LoadFailed what='this season' onRetry={retry} />
			</SeasonShell>
		);
	}

	if (!season) {
		return (
			<SeasonShell title='Season'>
				<EmptyState title='Season not found' message='It may have been deleted, or the link is wrong.' />
			</SeasonShell>
		);
	}

	return (
		<>
			<SeasonShell title={season.name} subtitle={season.venue.name}>
				<div {...stylex.props(styles.page)}>
					{/* First on the screen, and above the card whose In button it
					    explains. Not instead of the games: hiding the calendar
					    collects nothing and takes away what somebody needs in order
					    to decide whether paying is worth it. */}
					<SeasonDebtNotice debt={debt} season={season} games={games} displayName={user?.displayName ?? ''} />

					{next ? (
						<NextGameHero
							game={next}
							season={season}
							myResponse={myResponses[next.id]}
							isExtra={role === 'extra'}
							watching={isWatching(next.id)}
							debtLock={debtLock}
							now={now}
							onRespond={status => respond(next.id, status)}
							onClear={() => clear(next.id)}
							onWatchChange={canWatch ? watch => toggleWatch(next.id, watch) : undefined}
						/>
					) : (
						<EmptyState
							icon={<CalendarDaysIcon />}
							title='No games scheduled'
							message={
								isAdmin
									? 'Generate the season calendar from the admin settings.'
									: 'Nothing on the calendar yet. An admin will add games soon.'
							}
						/>
					)}

					{/* Straight under the next game, because it is the only thing on
					    this screen with a deadline on it and the only one that goes
					    away unanswered. Above Subscribe to calendar, which is here
					    every week where this is here for two days.

					    Each is a card with a way in rather than a row with a pill,
					    and it leads to the team sheet, where the ballot is and where
					    the notification about it lands. The game page is a headcount
					    for a game already played. */}
					{voting.length > 0 && (
						<section>
							<SectionHeading sx={styles.heading}>Man of the match</SectionHeading>
							<div {...stylex.props(styles.rows)}>
								{voting.map(game => (
									<MotmVoteCallout key={game.id} game={game} season={season} now={now} />
								))}
							</div>
						</section>
					)}

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
						<div {...stylex.props(styles.rows)}>
							{played.map(game => (
								<GameRow
									key={game.id}
									game={game}
									season={season}
									myResponse={myResponses[game.id]}
									debtLock={debtLock}
									now={now}
									onRespond={status => respond(game.id, status)}
									onClear={() => clear(game.id)}
								/>
							))}
						</div>
					</PlayedSection>

					{upcoming.length > 0 && (
						<section>
							<SectionHeading sx={styles.heading}>Coming up</SectionHeading>
							{/* The only list here handed a bell. `voting` and `played` are
							    finished by construction, the same fact `isWatchable` reads to
							    refuse one, so a game already behind us would draw nothing with
							    the props anyway. */}
							<div {...stylex.props(styles.rows)}>
								{upcoming.map(game => (
									<GameRow
										key={game.id}
										game={game}
										season={season}
										myResponse={myResponses[game.id]}
										watching={isWatching(game.id)}
										debtLock={debtLock}
										now={now}
										onRespond={status => respond(game.id, status)}
										onClear={() => clear(game.id)}
										onWatchChange={canWatch ? watch => toggleWatch(game.id, watch) : undefined}
									/>
								))}
							</div>
						</section>
					)}
				</div>
			</SeasonShell>

			<CalendarSubscribeSheet seasonId={seasonId} open={subscribeOpen} onClose={() => setSubscribeOpen(false)} />
		</>
	);
};

export default SeasonHomePage;
