'use client';

import { CheckCircleIcon, TrophyIcon } from '@heroicons/react/24/outline';
import type { AppUser, MotmVote, TournamentMotm, TournamentTeam } from '@shared/types';
import { formatRelative } from '@shared/format';
import { getMotmTurnout, isMotmVotingOpen } from '@shared/motm';
import Avatar from './Avatar';
import StatusPill from './StatusPill';
import TeamBadge from './TeamBadge';
import { nameByUid } from '../lib/people';
import { classNames } from '../lib/utils/reactHelper';
import { hapticLight } from '../lib/utils/haptics';

/**
 * Man of the match: the vote while it is open, the result once it is decided.
 *
 * Deliberately shows **no running total**. Until the vote is counted, what is on
 * screen is your own pick and how many people have made one — never who is
 * leading, because a visible lead is a lead people vote for. That is a rule
 * rather than a layout choice: nobody else's pick is readable at all, so this
 * screen could not draw a tally if it wanted to.
 *
 * Turnout is the one thing about a vote in progress that is published, and it is
 * a different question with a different answer — eight names with nothing
 * attached to them is not a leaderboard. What it is instead is the list the
 * group would otherwise reconstruct by asking each other, which is who still
 * hasn't voted.
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
	voterUids,
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
	/** Who has voted so far. Empty once it is counted — see `Decided`. */
	voterUids: string[];
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

	const name = (uid: string) => nameByUid(usersByUid, uid);

	const candidates = teams.flatMap(team => team.uids.map(uid => ({ uid, team: team.index })));
	const votes = new Map((motm?.counts ?? []).map(count => [count.uid, count.votes]));

	// Decided, the list stops being a ballot and becomes a result, so it is
	// ordered like one: most votes first. While the vote is open it stays in team
	// order, because there is nothing to rank by that anybody is allowed to see.
	// The sort is stable, so everybody level — including the whole tail nobody
	// voted for — keeps the team order they were drawn in.
	const ordered = motm
		? [...candidates].sort((a, b) => (votes.get(b.uid) ?? 0) - (votes.get(a.uid) ?? 0))
		: candidates;

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
			    same list, now answering a different question, and reordered to
			    answer it. */}
			<ul className='mt-3 grid gap-1.5 sm:grid-cols-2'>
				{ordered.map(candidate => {
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

			{open && <Turnout teams={teams} usersByUid={usersByUid} voterUids={voterUids} />}

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
 * Who has answered, while the vote is still open.
 *
 * The one thing about a vote in progress everybody may see, and it is worth
 * being clear about why it is not the thing the rest of the panel withholds:
 * this says eight people have voted, never that four of them voted for the same
 * man. There is no lead in it to fall in behind, which is the only reason the
 * picks are sealed at all.
 *
 * Drawn as the lineup with the people who haven't voted faded, rather than as a
 * list of names: the question is asked at a glance, on a phone, by somebody
 * deciding whether to nudge the group chat — and a sentence with eleven names in
 * it is not read at a glance. Everybody stays on screen either way, so the strip
 * is the same size all week and nobody's absence is a gap they have to be
 * counted to notice.
 *
 * Not drawn once the vote is counted. The turnout is the sum of the published
 * totals by then, and the document behind this is deleted with the window.
 */
const Turnout = ({
	teams,
	usersByUid,
	voterUids,
}: {
	teams: TournamentTeam[];
	usersByUid: Map<string, AppUser>;
	voterUids: string[];
}) => {
	const { voted, pending } = getMotmTurnout(teams, voterUids);
	const total = voted.length + pending.length;
	const answered = new Set(voted);

	if (total === 0) return null;

	const summary =
		pending.length === 0
			? 'Everybody has voted'
			: voted.length === 0
				? 'Nobody has voted yet'
				: `${voted.length} of ${total} voted`;

	return (
		<div className='mt-4 border-t border-white/5 pt-3'>
			<p className='text-muted text-xs font-medium tabular-nums'>{summary}</p>

			<ul className='mt-2 flex flex-wrap gap-1.5'>
				{[...voted, ...pending].map(uid => {
					const displayName = nameByUid(usersByUid, uid);
					const hasVoted = answered.has(uid);

					return (
						<li key={uid} aria-label={`${displayName} — ${hasVoted ? 'voted' : 'not yet'}`}>
							<Avatar
								displayName={displayName}
								photoURL={usersByUid.get(uid)?.photoURL}
								size='sm'
								// Faded rather than hidden: the people still to answer
								// are the reason anybody looks at this.
								className={classNames(!hasVoted && 'opacity-30')}
							/>
						</li>
					);
				})}
			</ul>
		</div>
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
