'use client';

import { useMemo, useState } from 'react';
import { CalendarDaysIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { groupGames } from '@shared/game';
import { useSeasonContext } from '../../../../components/SeasonProvider';
import { useMyResponses } from '../../../../hooks/useMyResponses';
import { useRespond } from '../../../../hooks/useRespond';
import { useLiveGameRedirect } from '../../../../hooks/useLiveGameRedirect';
import { useNow } from '../../../../hooks/useNow';
import SeasonShell from '../../../../components/SeasonShell';
import Skeleton from '../../../../components/Skeleton';
import EmptyState from '../../../../components/EmptyState';
import NextGameHero from '../../../../components/NextGameHero';
import GameRow from '../../../../components/GameRow';
import Button from '../../../../components/Button';
import CalendarSubscribeSheet from '../../../../components/CalendarSubscribeSheet';

const SeasonHomePage = () => {
	const { seasonId, season, games, loading, isAdmin, role } = useSeasonContext();
	const { myResponses, loading: responsesLoading } = useMyResponses();
	const { respond, clear } = useRespond(seasonId, role, myResponses);
	const [showPast, setShowPast] = useState(false);
	const [subscribeOpen, setSubscribeOpen] = useState(false);
	const now = useNow();

	// This is the screen the app lands on, so it's where somebody arriving during
	// a game they're playing in gets taken to it. Above the early returns, so a
	// slow first snapshot doesn't skip it — it waits for `ready` instead.
	useLiveGameRedirect({
		seasonId,
		season,
		games,
		myResponses,
		ready: !loading && !responsesLoading,
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
							now={now}
							onRespond={status => respond(next.id, status)}
							onClear={() => clear(next.id)}
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
					    this screen with a deadline on it — and straight to the team
					    sheet, where the vote is, the same place the notification
					    lands. The game page is a headcount for a game already
					    played. */}
					{voting.length > 0 && (
						<section>
							<h2 className='text-faint mb-3 px-1 text-xs font-semibold tracking-wider uppercase'>
								Man of the match
							</h2>
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

					{upcoming.length > 0 && (
						<section>
							<h2 className='text-faint mb-3 px-1 text-xs font-semibold tracking-wider uppercase'>
								Coming up
							</h2>
							<div className='space-y-2'>
								{upcoming.map(game => (
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
						</section>
					)}

					{played.length > 0 && (
						<section>
							<div className='mb-3 flex items-center justify-between px-1'>
								<h2 className='text-faint text-xs font-semibold tracking-wider uppercase'>
									Played ({played.length})
								</h2>
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
				</div>
			</SeasonShell>

			<CalendarSubscribeSheet seasonId={seasonId} open={subscribeOpen} onClose={() => setSubscribeOpen(false)} />
		</>
	);
};

export default SeasonHomePage;
