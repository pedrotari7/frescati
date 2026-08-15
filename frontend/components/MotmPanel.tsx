'use client';

import { CheckCircleIcon, TrophyIcon } from '@heroicons/react/24/outline';
import type { AppUser, MotmVote, TournamentMotm, TournamentTeam } from '@shared/types';
import { formatRelative } from '@shared/format';
import { isMotmVotingOpen } from '@shared/motm';
import Avatar from './Avatar';
import StatusPill from './StatusPill';
import TeamBadge from './TeamBadge';
import { classNames } from '../lib/utils/reactHelper';
import { hapticLight } from '../lib/utils/haptics';

/**
 * Man of the match: the vote while it is open, the result once it is decided.
 *
 * Deliberately shows **no running total**. Until the vote is counted the only
 * thing on screen is your own pick — not how many others have voted, not who is
 * leading — because a visible lead is a lead people vote for. That is a rule
 * rather than a layout choice: nobody else's vote is readable at all, so this
 * screen could not draw a tally if it wanted to.
 *
 * Whoever is looking is not necessarily in it. A game is public to the whole
 * group, so somebody who didn't play sees the same panel with no buttons in it —
 * which is the honest state, rather than a control that fails on write.
 */
const MotmPanel = ({
	teams,
	usersByUid,
	motm,
	vote,
	votingUntil,
	now,
	canVote,
	onVote,
}: {
	teams: TournamentTeam[];
	usersByUid: Map<string, AppUser>;
	/** The counted vote, or `null` while it is still open. */
	motm: TournamentMotm | null;
	/** Your own vote, or `null` if you haven't cast one. */
	vote: MotmVote | null;
	/** When the vote closes, as epoch milliseconds. Absent means it is shut. */
	votingUntil?: number;
	now: Date;
	/** Whether the person looking played in this game. */
	canVote: boolean;
	onVote: (uid: string) => void;
}) => {
	const open = isMotmVotingOpen(votingUntil, now.getTime());

	// Nothing to show at all: the game hasn't been confirmed, so nobody has been
	// asked anything yet. Drawing an empty trophy would promise a vote that is
	// not coming until somebody confirms the scores.
	if (!open && !motm) return null;

	const name = (uid: string) => usersByUid.get(uid)?.displayName ?? 'Unknown player';

	const candidates = teams.flatMap(team => team.uids.map(uid => ({ uid, team: team.index })));
	const votes = new Map((motm?.counts ?? []).map(count => [count.uid, count.votes]));

	return (
		<section className='glass rounded-3xl p-5'>
			<div className='mb-1 flex items-center justify-between gap-2'>
				<div className='flex items-center gap-2'>
					<TrophyIcon className='text-pending size-5 shrink-0' aria-hidden='true' />
					<h2 className='text-ink text-sm font-semibold'>Man of the match</h2>
				</div>

				{open ? (
					<StatusPill tone='pending'>
						{/* The deadline as a countdown rather than a date: two days
						    from now is the only thing anybody needs from it. */}
						Closes {formatRelative(new Date(votingUntil!).toISOString(), now)}
					</StatusPill>
				) : (
					<StatusPill tone='neutral'>Decided</StatusPill>
				)}
			</div>

			{motm ? (
				<Decided motm={motm} name={name} votes={votes} />
			) : (
				<p className='text-muted mb-4 text-sm leading-relaxed'>
					{canVote
						? 'Who stood out? One vote each, and nobody sees the count until it closes.'
						: 'The players are voting. The result appears here when it closes.'}
				</p>
			)}

			{/* The list stays up after the vote closes, carrying the counts — the
			    same list, now answering a different question. */}
			<ul className='mt-3 grid gap-1.5 sm:grid-cols-2'>
				{candidates.map(candidate => {
					const picked = vote?.votedFor === candidate.uid;
					const won = motm?.winners.includes(candidate.uid) ?? false;
					const count = votes.get(candidate.uid) ?? 0;

					return (
						<li key={candidate.uid}>
							<button
								type='button'
								disabled={!open || !canVote}
								aria-pressed={picked}
								onClick={() => {
									hapticLight();
									onVote(candidate.uid);
								}}
								className={classNames(
									'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
									'focus-visible:ring-brand/60 focus-visible:ring-2 focus-visible:outline-none',
									// Not a disabled control once the vote is over — it is
									// a list again, and greying every name would read as
									// something being unavailable rather than finished.
									open && canVote && 'hover:bg-white/5 active:scale-[0.99]',
									picked && 'bg-brand/10 ring-brand/30 ring-1',
									won && 'bg-pending/10 ring-pending/30 ring-1'
								)}
							>
								<Avatar
									displayName={name(candidate.uid)}
									photoURL={usersByUid.get(candidate.uid)?.photoURL}
									size='sm'
								/>
								<span className='text-ink min-w-0 flex-1 truncate text-sm'>{name(candidate.uid)}</span>

								{won && <TrophyIcon className='text-pending size-4 shrink-0' aria-hidden='true' />}
								{picked && !motm && (
									<CheckCircleIcon className='text-brand size-4 shrink-0' aria-hidden='true' />
								)}

								{/* Counts only exist once it is decided, and a nil is
								    left blank — a column of zeroes is a list of people
								    nobody voted for, printed out. */}
								{motm && count > 0 && (
									<span className='text-muted shrink-0 text-xs font-semibold tabular-nums'>
										{count}
									</span>
								)}

								<TeamBadge index={candidate.team} size='sm' />
							</button>
						</li>
					);
				})}
			</ul>

			{open && canVote && (
				<p className='text-faint mt-3 text-xs'>
					{vote
						? 'Tap another name to change your mind, or the same one to take it back.'
						: 'You can change your mind until it closes.'}
				</p>
			)}
		</section>
	);
};

/**
 * The result line.
 *
 * A tie is stated as a tie rather than resolved: the group produced two names,
 * and they share the rating bonus the same way teams level on every tie-break
 * share a finishing position.
 */
const Decided = ({
	motm,
	name,
	votes,
}: {
	motm: TournamentMotm;
	name: (uid: string) => string;
	votes: Map<string, number>;
}) => {
	if (motm.winners.length === 0) {
		return <p className='text-muted mb-1 text-sm leading-relaxed'>Nobody voted, so nobody got it this week.</p>;
	}

	const [top] = motm.winners;

	return (
		<div className='mb-1'>
			<p className='text-ink text-lg leading-tight font-bold'>
				{motm.winners.map(name).join(' & ')}
				{motm.winners.length > 1 && <span className='text-muted text-sm font-normal'> — shared</span>}
			</p>
			<p className='text-faint mt-0.5 text-xs'>
				{votes.get(top) ?? 0} of {[...votes.values()].reduce((total, count) => total + count, 0)} votes
			</p>
		</div>
	);
};

export default MotmPanel;
