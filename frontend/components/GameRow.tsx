'use client';

import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import type { Game, GameResponse, ResponseStatus, Season } from '@shared/types';
import { getFormat, getGameLifecycle, getHeadcountState } from '@shared/game';
import { formatGameDate, formatGameTime } from '@shared/format';
import { classNames } from '../lib/utils/reactHelper';
import RespondControl from './RespondControl';
import StatusPill from './StatusPill';

const GameRow = ({
	game,
	season,
	myResponse,
	onRespond,
	onClear,
}: {
	game: Game;
	season: Season;
	myResponse: GameResponse | undefined;
	onRespond: (status: ResponseStatus) => Promise<void>;
	onClear: () => Promise<void>;
}) => {
	const lifecycle = getGameLifecycle(game, season);
	const isPast = lifecycle === 'finished';
	const atRisk = getHeadcountState(game, season) === 'at-risk';
	const timezone = season.slot.timezone;

	return (
		<div
			className={classNames(
				'glass-card rounded-2xl p-4',
				lifecycle === 'cancelled' && 'opacity-55',
				isPast && 'opacity-70'
			)}
		>
			<Link href={`/s/${season.id}/g/${game.id}`} className='flex items-center gap-3'>
				<div className='min-w-0 flex-1'>
					<div className='flex items-center gap-2'>
						<span className='text-ink text-sm font-semibold'>{formatGameDate(game.kickoff, timezone)}</span>
						<span className='text-faint text-sm tabular-nums'>
							{formatGameTime(game.kickoff, timezone)}
						</span>
						{game.isOneOff && <StatusPill tone='extra'>One-off</StatusPill>}
					</div>

					<div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
						{lifecycle === 'cancelled' ? (
							<StatusPill tone='out'>Cancelled</StatusPill>
						) : (
							<>
								<span
									className={classNames('text-xs font-semibold', atRisk ? 'text-pending' : 'text-in')}
								>
									{game.counts.playing} playing
								</span>
								{!atRisk && getFormat(game.counts.playing) && (
									<span className='text-faint text-xs'>· {getFormat(game.counts.playing)}</span>
								)}
								{atRisk && !isPast && <StatusPill tone='pending'>Short</StatusPill>}
							</>
						)}

						{myResponse && (
							<StatusPill tone={myResponse.status === 'in' ? 'in' : 'out'}>
								{myResponse.status === 'in' ? "You're in" : "You're out"}
							</StatusPill>
						)}
						{!myResponse && lifecycle === 'open' && <StatusPill tone='pending'>No answer</StatusPill>}
					</div>
				</div>

				<ChevronRightIcon className='text-faint size-5 shrink-0' aria-hidden='true' />
			</Link>

			{lifecycle === 'open' && (
				<div className='mt-3'>
					<RespondControl status={myResponse?.status} onRespond={onRespond} onClear={onClear} size='sm' />
				</div>
			)}
		</div>
	);
};

export default GameRow;
