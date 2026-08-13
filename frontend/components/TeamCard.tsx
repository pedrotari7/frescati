'use client';

import Link from 'next/link';
import type { AppUser, TournamentTeam } from '@shared/types';
import { toDisplayRating } from '@shared/rating';
import { toDisplayMovement } from '@shared/leaderboard';
import Avatar from './Avatar';
import { classNames } from '../lib/utils/reactHelper';

/** Bibs, in team order. Four is the ceiling, so four is all there is. */
const TEAM_STYLES = [
	{ name: 'A', text: 'text-team-a', ring: 'ring-team-a/30', chip: 'bg-team-a/15 text-team-a' },
	{ name: 'B', text: 'text-team-b', ring: 'ring-team-b/30', chip: 'bg-team-b/15 text-team-b' },
	{ name: 'C', text: 'text-team-c', ring: 'ring-team-c/30', chip: 'bg-team-c/15 text-team-c' },
	{ name: 'D', text: 'text-team-d', ring: 'ring-team-d/30', chip: 'bg-team-d/15 text-team-d' },
];

export const teamName = (index: number): string => TEAM_STYLES[index]?.name ?? `${index + 1}`;

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
	const style = TEAM_STYLES[team.index] ?? TEAM_STYLES[0];
	const average = team.uids.reduce((total, uid) => total + (elos[uid] ?? 0), 0) / Math.max(1, team.uids.length);
	const rotating = team.uids.length - sideSize;

	return (
		<section className={classNames('glass rounded-3xl p-4 ring-1', style.ring)}>
			<header className='mb-3 flex items-baseline justify-between gap-2'>
				<div className='flex items-baseline gap-2'>
					<span className={classNames('text-lg font-bold', style.text)}>Team {style.name}</span>
					<span className='text-faint text-xs'>
						{team.uids.length} player{team.uids.length === 1 ? '' : 's'}
					</span>
				</div>

				<span className={classNames('rounded-full px-2 py-0.5 text-[11px] font-semibold', style.chip)}>
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
								{/* Full name, not the first-name shorthand used elsewhere: a team
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
		</section>
	);
};

export default TeamCard;
