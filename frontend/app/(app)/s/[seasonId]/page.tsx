'use client';

import { useMemo, useState } from 'react';
import { CalendarDaysIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { groupGames } from '@shared/game';
import { useSeasonContext } from '../../../../components/SeasonProvider';
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
import Button from '../../../../components/Button';
import CalendarSubscribeSheet from '../../../../components/CalendarSubscribeSheet';
import { SectionHeading } from '../../../../components/Section';

const SeasonHomePage = () => {
	const { seasonId, season, games, myResponses, loading, error, retry, isAdmin, role } = useSeasonContext();
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
		() => (season ? groupGames(games, season, now) : { next: null, upcoming: [], voting: [], played: [] }),
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
				<div className='space-y-6 p-4'>
					{next ? (
						<NextGameHero
							game={next}
							season={season}
							myResponse={myResponses[next.id]}
							isExtra={role === 'extra'}
							watching={isWatching(next.id)}
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

					<Button variant='ghost' size='sm' onClick={() => setSubscribeOpen(true)}>
						<CalendarIcon className='size-4' aria-hidden='true' />
						Subscribe to calendar
					</Button>

					{/* Above the games still to come, because it is the only thing on
					    this screen with a deadline on it, and straight to the team
					    sheet, where the vote is, the same place the notification
					    lands. The game page is a headcount for a game already
					    played. */}
					{voting.length > 0 && (
						<section>
							<SectionHeading className='mb-3 px-1'>Man of the match</SectionHeading>
							<div className='space-y-2'>
								{voting.map(game => (
									<GameRow
										key={game.id}
										game={game}
										season={season}
										myResponse={myResponses[game.id]}
										href={`/s/${seasonId}/g/${game.id}/tournament`}
										now={now}
										onRespond={status => respond(game.id, status)}
										onClear={() => clear(game.id)}
									/>
								))}
							</div>
						</section>
					)}

					{/* Above the games still to come, and collapsed by default so it
					    costs them one row rather than a scroll. Closed it is a
					    heading and a count, which is what the last result is worth
					    to somebody who came to answer the next one, and it sits
					    beside the vote that may still be running on the game at the
					    top of it. */}
					{played.length > 0 && (
						<section>
							<div className='mb-3 flex items-center justify-between px-1'>
								<SectionHeading>Played ({played.length})</SectionHeading>
								<Button variant='ghost' size='sm' onClick={() => setShowPast(!showPast)}>
									{showPast ? 'Hide' : 'Show'}
								</Button>
							</div>

							{showPast && (
								<div className='space-y-2'>
									{played.map(game => (
										<GameRow
											key={game.id}
											game={game}
											season={season}
											myResponse={myResponses[game.id]}
											now={now}
											onRespond={status => respond(game.id, status)}
											onClear={() => clear(game.id)}
										/>
									))}
								</div>
							)}
						</section>
					)}

					{upcoming.length > 0 && (
						<section>
							<SectionHeading className='mb-3 px-1'>Coming up</SectionHeading>
							{/* The only list here handed a bell. `voting` and `played` are
							    finished by construction, the same fact `isWatchable` reads to
							    refuse one, so a game already behind us would draw nothing with
							    the props anyway. */}
							<div className='space-y-2'>
								{upcoming.map(game => (
									<GameRow
										key={game.id}
										game={game}
										season={season}
										myResponse={myResponses[game.id]}
										watching={isWatching(game.id)}
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
