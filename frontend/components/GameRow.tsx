'use client';

import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import type { Game, GameResponse, ResponseStatus, Season } from '@shared/types';
import type { GameLifecycle } from '@shared/game';
import { getExtraSpot, getFormat, getGameLifecycle, getHeadcountState, isWatchable } from '@shared/game';
import { formatGameDate, formatGameTime } from '@shared/format';
import { isMotmVotingOpen } from '@shared/motm';
import { classNames } from '../lib/utils/reactHelper';
import RespondControl from './RespondControl';
import type { PillTone } from './StatusPill';
import StatusPill from './StatusPill';
import WatchToggle from './WatchToggle';

/**
 * What the row says about your own answer, or `null` when you haven't given one
 * or the buttons below are already saying it.
 *
 * An extra's In is not the same fact as a member's, and this row is where that
 * shows: the headcount beside this pill is the one this answer deliberately
 * does not move. "You're in" there would be the app agreeing with a tap it has
 * not honoured yet, on the screen somebody checks precisely to find out whether
 * it has.
 *
 * Once the game is behind us the wait is not pending, it is over. Nobody
 * confirms a spot for a game that has been played, and a cancelled one has no
 * spots left to give. So it settles to the plain fact that they never got on,
 * rather than an amber pill on a dead question.
 */
const answerPill = (
	myResponse: GameResponse | undefined,
	lifecycle: GameLifecycle
): { tone: PillTone; label: string } | null => {
	if (!myResponse) return null;

	if (getExtraSpot(myResponse) === 'pending') {
		const settled = lifecycle === 'finished' || lifecycle === 'cancelled';

		return settled ? { tone: 'neutral', label: 'No spot' } : { tone: 'pending', label: 'Spot pending' };
	}

	// While the game is still open the pair below says this in the row's biggest
	// type, and a card that says "You're in" twice reads as two separate facts.
	// The pill is what carries the answer once the buttons are gone.
	if (lifecycle === 'open') return null;

	return myResponse.status === 'in' ? { tone: 'in', label: "You're in" } : { tone: 'out', label: "You're out" };
};

const GameRow = ({
	game,
	season,
	myResponse,
	href,
	watching = false,
	now,
	onRespond,
	onClear,
	onWatchChange,
}: {
	game: Game;
	season: Season;
	myResponse: GameResponse | undefined;
	/** Where the row leads. Defaults to the game itself. */
	href?: string;
	watching?: boolean;
	/** Passed in rather than read here, so every row on a screen agrees. */
	now: Date;
	onRespond: (status: ResponseStatus) => Promise<void>;
	onClear: () => Promise<void>;
	/**
	 * Left off when nobody is signed in, no handler, no bell, rather than a
	 * dead one. The state comes from the screen rather than from here: a row
	 * that fetched its own would be a listener per row, which is the whole
	 * reason these are drawn off the denormalised `counts` in the first place.
	 */
	onWatchChange?: (next: boolean) => void;
}) => {
	const lifecycle = getGameLifecycle(game, season, now);
	const isPast = lifecycle === 'finished';
	const voting = isMotmVotingOpen(game.motmVotingUntilMillis, now.getTime());
	const atRisk = getHeadcountState(game, season) === 'at-risk';
	const timezone = season.slot.timezone;
	const answer = answerPill(myResponse, lifecycle);

	return (
		<div
			className={classNames(
				'glass-card rounded-2xl p-4',
				lifecycle === 'cancelled' && 'opacity-55',
				// Faded because it is behind us, but not while the vote is out, or
				// the one row on the screen still asking for something would be the
				// quietest thing on it.
				isPast && !voting && 'opacity-70'
			)}
		>
			{/* The bell is the row's second action, so it sits beside the link
			    rather than inside it, nesting a button in an anchor swallows it,
			    the same reason the hero keeps its own outside the panel it draws.
			    The chevron stays at the end of the link, because it is what says
			    the row leads somewhere and the bell is not. */}
			<div className='flex items-center gap-1'>
				<Link href={href ?? `/s/${season.id}/g/${game.id}`} className='flex min-w-0 flex-1 items-center gap-3'>
					<div className='min-w-0 flex-1'>
						<div className='flex items-center gap-2'>
							<span className='text-ink text-sm font-semibold'>
								{formatGameDate(game.kickoff, timezone)}
							</span>
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
										className={classNames(
											'text-xs font-semibold',
											atRisk ? 'text-pending' : 'text-in'
										)}
									>
										{game.counts.playing} playing
									</span>
									{!atRisk && getFormat(game.counts.playing) && (
										<span className='text-faint text-xs'>· {getFormat(game.counts.playing)}</span>
									)}
									{atRisk && !isPast && <StatusPill tone='pending'>Short</StatusPill>}
								</>
							)}

							{/* Says why a played game is still up here, and stays honest
							    for somebody who wasn't in the lineup: the vote is open,
							    not that they have one. */}
							{voting && <StatusPill tone='pending'>Vote open</StatusPill>}

							{answer && <StatusPill tone={answer.tone}>{answer.label}</StatusPill>}
							{!myResponse && lifecycle === 'open' && <StatusPill tone='pending'>No answer</StatusPill>}
						</div>
					</div>

					<ChevronRightIcon className='text-faint size-5 shrink-0' aria-hidden='true' />
				</Link>

				{onWatchChange && isWatchable(lifecycle) && (
					<WatchToggle watching={watching} onChange={onWatchChange} />
				)}
			</div>

			{lifecycle === 'open' && (
				<div className='mt-3'>
					<RespondControl response={myResponse} onRespond={onRespond} onClear={onClear} size='sm' />
				</div>
			)}
		</div>
	);
};

export default GameRow;
