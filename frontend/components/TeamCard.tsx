'use client';

import Link from 'next/link';
import type { AppUser, TournamentTeam } from '@shared/types';
import { toDisplayRating } from '@shared/rating';
import { toDisplayMovement } from '@shared/leaderboard';
import Avatar from './Avatar';
import TeamBadge, { teamName, teamStyle } from './TeamBadge';
import { classNames } from '../lib/utils/reactHelper';

/**
 * What this game did to somebody's rating.
 *
 * Rendered on the displayed 0–100 scale rather than in Elo, so it agrees with
 * the number next to it — a game worth 30 Elo reads as +6, and a player whose
 * change rounds to nothing shows nothing rather than a misleading `+0`.
 */
const movement = (delta: number | undefined) => {
	if (delta === undefined) return null;

	const shown = toDisplayMovement(delta);
	if (shown === 0) return null;

	return (
		<span className={classNames('text-[11px] font-semibold tabular-nums', shown > 0 ? 'text-in' : 'text-out')}>
			{shown > 0 ? '+' : ''}
			{shown}
		</span>
	);
};

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
}: {
	team: TournamentTeam;
	elos: Record<string, number>;
	usersByUid: Map<string, AppUser>;
	sideSize: number;
	highlightUid?: string | null;
	/** Rating movement per uid, once the game has been confirmed. */
	deltas?: Map<string, number>;
}) => {
	const style = teamStyle(team.index);
	const average = team.uids.reduce((total, uid) => total + (elos[uid] ?? 0), 0) / Math.max(1, team.uids.length);
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
							<p className='text-faint text-xs'>
								{team.uids.length} player{team.uids.length === 1 ? '' : 's'}
							</p>
						</div>
					</div>

					<span
						className={classNames(
							'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
							style.chip
						)}
					>
						avg {toDisplayRating(average)}
					</span>
				</header>

				<ul className='space-y-1'>
					{team.uids.map(uid => {
						const user = usersByUid.get(uid);

						return (
							<li key={uid}>
								<Link
									href={`/u/${uid}`}
									className={classNames(
										'flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/5',
										uid === highlightUid && 'bg-white/6'
									)}
								>
									<Avatar
										displayName={user?.displayName ?? 'Unknown player'}
										photoURL={user?.photoURL}
										size='sm'
									/>
									{/* Full name, like every other list of people in the app: a team
									    sheet is where two Davids have to be told apart. */}
									<span className='text-ink min-w-0 flex-1 truncate text-sm'>
										{user?.displayName ?? 'Unknown player'}
									</span>
									{movement(deltas?.get(uid))}
									<span className='text-faint text-xs tabular-nums'>
										{toDisplayRating(elos[uid] ?? 0)}
									</span>
								</Link>
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
