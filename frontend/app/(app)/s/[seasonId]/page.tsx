'use client';

import { useMemo, useState } from 'react';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import { getGameLifecycle } from '@shared/game';
import { useSeasonContext } from '../../../../components/SeasonProvider';
import { useMyResponses } from '../../../../hooks/useMyResponses';
import { useRespond } from '../../../../hooks/useRespond';
import { useNow } from '../../../../hooks/useNow';
import SeasonShell from '../../../../components/SeasonShell';
import Skeleton from '../../../../components/Skeleton';
import EmptyState from '../../../../components/EmptyState';
import NextGameHero from '../../../../components/NextGameHero';
import GameRow from '../../../../components/GameRow';
import Button from '../../../../components/Button';

const SeasonHomePage = () => {
	const { seasonId, season, games, loading, isAdmin, role } = useSeasonContext();
	const { myResponses } = useMyResponses();
	const { respond, clear } = useRespond(seasonId, role, myResponses);
	const [showPast, setShowPast] = useState(false);
	const now = useNow();

	const { next, upcoming, past } = useMemo(() => {
		if (!season) return { next: null, upcoming: [], past: [] };

		const notFinished = games.filter(game => getGameLifecycle(game, season, now) !== 'finished');
		const finished = games.filter(game => getGameLifecycle(game, season, now) === 'finished').reverse();

		// The next game is the soonest one that hasn't ended, cancelled or not —
		// a cancellation is exactly the thing people open the app to find out.
		const [first, ...rest] = notFinished;

		return { next: first ?? null, upcoming: rest, past: finished };
	}, [games, season, now]);

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

				{past.length > 0 && (
					<section>
						<div className='mb-3 flex items-center justify-between px-1'>
							<h2 className='text-faint text-xs font-semibold tracking-wider uppercase'>
								Played ({past.length})
							</h2>
							<Button variant='ghost' size='sm' onClick={() => setShowPast(!showPast)}>
								{showPast ? 'Hide' : 'Show'}
							</Button>
						</div>

						{showPast && (
							<div className='space-y-2'>
								{past.map(game => (
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
	);
};

export default SeasonHomePage;
