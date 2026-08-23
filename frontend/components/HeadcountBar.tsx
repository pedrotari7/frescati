import type { Game, Season } from '@shared/types';
import { getAwaitingSpotCount, getFormat, getHeadcountState, getMinPlayers, getNoResponseCount } from '@shared/game';
import { classNames } from '../lib/utils/reactHelper';
import StatusPill from './StatusPill';

/**
 * Progress towards the season minimum. There is no cap. The bar fills to the
 * minimum and then simply reads "ready", because more players is never a
 * problem, only fewer is.
 */
const HeadcountBar = ({ game, season, className = '' }: { game: Game; season: Season; className?: string }) => {
	const minimum = getMinPlayers(game, season);
	const { playing } = game.counts;
	const atRisk = getHeadcountState(game, season) === 'at-risk';
	const format = getFormat(playing);
	const awaiting = getNoResponseCount(game.counts, season.memberUids.length);
	const awaitingSpot = getAwaitingSpotCount(game.counts);

	const progress = minimum > 0 ? Math.min(100, (playing / minimum) * 100) : 100;

	return (
		<div className={className}>
			<div className='mb-2 flex items-baseline justify-between gap-2'>
				<div className='flex items-baseline gap-1.5'>
					{/* The number an end-to-end test watches for the response
					    trigger's answer coming back down the listener. It is a
					    bare numeral with no accessible name of its own, and
					    matching on its text alone would find the scoreline and
					    the squad count too. */}
					<span
						data-testid='headcount-playing'
						className={classNames('text-2xl font-bold', atRisk ? 'text-pending' : 'text-in')}
					>
						{playing}
					</span>
					<span className='text-faint text-sm'>{atRisk ? `of ${minimum} needed` : 'playing'}</span>
				</div>

				{format && !atRisk && <StatusPill tone='brand'>{format}</StatusPill>}
				{atRisk && <StatusPill tone='pending'>Need {minimum - playing} more</StatusPill>}
			</div>

			<div className='h-1.5 overflow-hidden rounded-full bg-white/8'>
				<div
					className={classNames(
						'h-full rounded-full transition-all duration-500 ease-out',
						atRisk ? 'bg-pending' : 'bg-in'
					)}
					style={{ width: `${progress}%` }}
				/>
			</div>

			<div className='text-faint mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs'>
				<span>{game.counts.membersIn} squad</span>
				{game.counts.extrasConfirmed > 0 && <span>{game.counts.extrasConfirmed} extra</span>}
				{/* The one item on this strip that is a request rather than a
				    report, and coloured for it: these are the people the number
				    above deliberately did not move for, and an admin is the only
				    one who can. Without it, an extra tapping In changes nothing
				    anybody can see. */}
				{awaitingSpot > 0 && <span className='text-pending'>{awaitingSpot} awaiting a spot</span>}
				{game.counts.membersOut > 0 && <span>{game.counts.membersOut} out</span>}
				{awaiting > 0 && <span>{awaiting} yet to answer</span>}
			</div>
		</div>
	);
};

export default HeadcountBar;
