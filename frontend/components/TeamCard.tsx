'use client';

import Link from 'next/link';
import { ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import type { AppUser, TournamentTeam } from '@shared/types';
import { toDisplayRating } from '@shared/rating';
import { counted } from '@shared/format';
import { displayNameOf } from '../lib/people';
import Avatar from './Avatar';
import RatingMovement from './RatingMovement';
import StatusPill from './StatusPill';
import TeamBadge, { teamName, teamStyle } from './TeamBadge';
import { classNames } from '../lib/utils/reactHelper';

/**
 * One squad's team sheet.
 *
 * `sideSize` is how many of them are on the pitch at once. When the squad is
 * bigger than that — which happens on any odd headcount — the surplus rotate
 * through rather than one person watching the whole game, so the card says so
 * instead of implying somebody is dropped.
 */
const TeamCard = ({
	team,
	elos,
	usersByUid,
	sideSize,
	highlightUid,
	deltas,
	notPlaying,
	absentUids,
	onMovePlayer,
}: {
	team: TournamentTeam;
	elos: Record<string, number>;
	usersByUid: Map<string, AppUser>;
	sideSize: number;
	highlightUid?: string | null;
	/** Rating movement per uid, once the game has been confirmed. */
	deltas?: Map<string, number>;
	/**
	 * Anyone on this sheet who is no longer in the playing pool. Only possible
	 * on a hand-picked lineup, which stops being re-picked — so the sheet can
	 * outlive somebody's answer, and saying nothing would leave a squad quietly
	 * a man short on the night.
	 */
	notPlaying?: Set<string>;
	/**
	 * Anyone a season admin has reported as a no-show. Different from
	 * `notPlaying` and louder: that is somebody who changed their answer, this
	 * is somebody who didn't. Their team played a man down, which is the one
	 * thing a team sheet is in a position to say.
	 */
	absentUids?: Set<string>;
	/** Season admins only: open the sheet that moves this player elsewhere. */
	onMovePlayer?: (uid: string) => void;
}) => {
	const style = teamStyle(team.index);
	// Only over the ratings we actually hold. Treating a missing one as zero
	// dragged the whole squad's badge down by whatever share of it that player
	// was — a worse answer than an average of the people we can price.
	const rated = team.uids.map(uid => elos[uid]).filter((elo): elo is number => typeof elo === 'number');
	const average = rated.length > 0 ? rated.reduce((total, elo) => total + elo, 0) / rated.length : null;
	const rotating = team.uids.length - sideSize;

	return (
		<section className={classNames('glass overflow-hidden rounded-3xl ring-1', style.ring)}>
			{/* Reads as a bib from across the card, before any letter has been. */}
			<div className={classNames('h-1.5 w-full', style.bar)} aria-hidden='true' />

			<div className='p-4'>
				<header className='mb-3 flex items-center justify-between gap-2'>
					<div className='flex min-w-0 items-center gap-2.5'>
						<TeamBadge index={team.index} size='md' />

						<div className='min-w-0'>
							<p className={classNames('text-lg leading-tight font-bold', style.text)}>
								Team {teamName(team.index)}
							</p>
							<p className='text-faint text-xs'>{counted(team.uids.length, 'player')}</p>
						</div>
					</div>

					{average !== null && (
						<span
							className={classNames(
								'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
								style.chip
							)}
						>
							avg {toDisplayRating(average)}
						</span>
					)}
				</header>

				<ul className='space-y-1'>
					{team.uids.map(uid => {
						const user = usersByUid.get(uid);
						const elo = elos[uid];
						const noShow = absentUids?.has(uid) === true;
						// A no-show is the louder of the two and the only one that is
						// somebody's report rather than a derived disagreement, so it
						// wins the row where both would apply.
						const dropped = !noShow && notPlaying?.has(uid) === true;

						return (
							<li
								key={uid}
								className={classNames(
									'flex items-center rounded-xl transition-colors',
									uid === highlightUid && 'bg-white/6'
								)}
							>
								{/* Only the name is the link. An admin's move button sits
								    beside it, and a <button> inside an <a> is invalid and
								    breaks keyboard navigation. */}
								<Link
									href={`/u/${uid}`}
									className='flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/5'
								>
									<Avatar displayName={displayNameOf(user)} photoURL={user?.photoURL} size='sm' />
									{/* Full name, like every other list of people in the app: a team
									    sheet is where two Davids have to be told apart. */}
									<span
										className={classNames(
											'min-w-0 flex-1 truncate text-sm',
											noShow || dropped ? 'text-muted line-through' : 'text-ink'
										)}
									>
										{displayNameOf(user)}
									</span>
									{noShow && <StatusPill tone='out'>No-show</StatusPill>}
									{dropped && <StatusPill tone='out'>Out</StatusPill>}
									<RatingMovement delta={deltas?.get(uid)} className='text-[11px]' />
									<span className='text-faint text-xs tabular-nums'>
										{typeof elo === 'number' ? toDisplayRating(elo) : '–'}
									</span>
								</Link>

								{onMovePlayer && (
									<button
										type='button'
										onClick={() => onMovePlayer(uid)}
										aria-label={`Move ${displayNameOf(user)} to another team`}
										className='text-faint hover:text-ink mr-1 flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/5 active:bg-white/10'
									>
										<ArrowsRightLeftIcon className='size-4' aria-hidden='true' />
									</button>
								)}
							</li>
						);
					})}
				</ul>

				{rotating > 0 && (
					<p className='text-faint mt-3 text-[11px]'>
						{sideSize} on the pitch · {rotating} rotating
					</p>
				)}
			</div>
		</section>
	);
};

export default TeamCard;
