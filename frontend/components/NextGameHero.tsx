'use client';

import Link from 'next/link';
import { MapPinIcon } from '@heroicons/react/24/outline';
import type { Game, GameResponse, ResponseStatus, Season } from '@shared/types';
import { getGameLifecycle } from '@shared/game';
import { formatGameDateLong, formatGameTime, formatRelative } from '@shared/format';
import HeadcountBar from './HeadcountBar';
import RespondControl from './RespondControl';
import StatusPill from './StatusPill';

/**
 * The whole point of the app on one card: when the next game is, whether it's
 * on, and two buttons to answer.
 */
const NextGameHero = ({
	game,
	season,
	myResponse,
	isExtra,
	onRespond,
	onClear,
}: {
	game: Game;
	season: Season;
	myResponse: GameResponse | undefined;
	isExtra: boolean;
	onRespond: (status: ResponseStatus) => Promise<void>;
	onClear: () => Promise<void>;
}) => {
	const lifecycle = getGameLifecycle(game, season);
	const timezone = season.slot.timezone;

	return (
		<section className='glass animate-rise shadow-glass relative overflow-hidden rounded-3xl p-5'>
			<div
				className='bg-brand/20 pointer-events-none absolute -top-24 -right-20 size-56 rounded-full blur-3xl'
				aria-hidden='true'
			/>

			<div className='relative'>
				<div className='mb-3 flex items-center gap-2'>
					<StatusPill tone='brand'>Next game</StatusPill>
					<span className='text-faint text-xs'>{formatRelative(game.kickoff)}</span>
					{lifecycle === 'cancelled' && <StatusPill tone='out'>Cancelled</StatusPill>}
					{lifecycle === 'locked' && <StatusPill tone='neutral'>Locked</StatusPill>}
					{lifecycle === 'live' && <StatusPill tone='in'>Playing now</StatusPill>}
				</div>

				<Link href={`/s/${season.id}/g/${game.id}`} className='block'>
					<h2 className='text-ink text-2xl leading-tight font-bold'>
						{formatGameDateLong(game.kickoff, timezone)}
					</h2>
					<p className='text-brand mt-0.5 text-3xl font-bold tabular-nums'>
						{formatGameTime(game.kickoff, timezone)}
					</p>
					<p className='text-muted mt-2 flex items-center gap-1.5 text-sm'>
						<MapPinIcon className='size-4 shrink-0' aria-hidden='true' />
						{game.venue.name}
					</p>
				</Link>

				<HeadcountBar game={game} season={season} className='mt-5' />

				{lifecycle === 'cancelled' ? (
					<p className='text-out mt-5 text-sm'>{game.cancelledReason || 'This game is off.'}</p>
				) : (
					<>
						<div className='mt-5'>
							<RespondControl
								status={myResponse?.status}
								onRespond={onRespond}
								onClear={onClear}
								disabled={lifecycle !== 'open'}
							/>
						</div>

						{lifecycle === 'locked' && (
							<p className='text-faint mt-3 text-center text-xs'>
								Answers closed {season.responseDeadlineHours}h before kickoff. Ask an admin if you need
								to change yours.
							</p>
						)}

						{isExtra && lifecycle === 'open' && (
							<p className='text-extra mt-3 text-center text-xs'>
								You&apos;re not in the squad for this season, so you&apos;ll be listed as an extra.
							</p>
						)}
					</>
				)}
			</div>
		</section>
	);
};

export default NextGameHero;
