'use client';

import { CheckCircleIcon, TrophyIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { AppUser, MotmVote, TournamentMotm, TournamentTeam } from '@shared/types';
import { formatRelative } from '@shared/format';
import { getMotmTurnout, isMotmVotingOpen } from '@shared/motm';
import Avatar from './Avatar';
import StatusPill from './StatusPill';
import TeamBadge from './TeamBadge';
import { nameByUid } from '../lib/people';
import { hapticLight } from '../lib/utils/haptics';
import { bp, colors, tint } from '../app/tokens.stylex';
import { focus, surfaces, utils } from '../lib/styles';

const styles = stylex.create({
	card: { borderRadius: 24, padding: 20 },

	head: { marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	title: { display: 'flex', alignItems: 'center', gap: 8 },
	trophy: { color: colors.pending, width: 20, height: 20, flexShrink: 0 },
	heading: { color: colors.ink, fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	blurb: { color: colors.muted, marginBottom: 16, fontSize: 14, lineHeight: 1.625 },

	/* One column on a phone, two once there is room. Twelve short rows in a
	   single column is a lot of scrolling on a screen that is mostly names. */
	ballot: {
		marginTop: 12,
		display: 'grid',
		gap: 6,
		gridTemplateColumns: { default: null, [bp.sm]: 'repeat(2, minmax(0, 1fr))' },
	},
	option: {
		display: 'flex',
		width: '100%',
		alignItems: 'center',
		gap: 10,
		borderRadius: 12,
		borderWidth: 0,
		backgroundColor: 'transparent',
		paddingInline: 10,
		paddingBlock: 8,
		textAlign: 'left',
		transitionProperty: 'background-color, transform',
		transitionDuration: '0.2s',
	},

	/*
	 * Three states rather than two that overlap. Backing the winner is the
	 * common case, and it used to put both class strings on one element and
	 * leave Tailwind's output order to decide which ring showed, on the most
	 * rewarding row on the screen. It gets its own treatment: the trophy's
	 * wash, ringed in the colour of your own pick, so it says both.
	 *
	 * A shadow rather than a border, for the reason Tailwind's ring is one: the
	 * row is already laid out, and a border would move its contents by a pixel.
	 */
	wonPicked: { backgroundColor: tint.pending15, boxShadow: `0 0 0 1px ${tint.brand40}` },
	won: { backgroundColor: tint.pending10, boxShadow: `0 0 0 1px ${tint.pending30}` },
	picked: { backgroundColor: tint.brand10, boxShadow: `0 0 0 1px ${tint.brand30}` },

	/*
	 * The hover tint, on the rows that have no wash of their own.
	 *
	 * Under Tailwind it was on every row, and hovering a row you had picked
	 * turned it white, which read as un-picking it. It cannot be layered here
	 * anyway: a later style in a `stylex.props` call replaces a property
	 * outright, conditions and all, so a hover-only background would erase the
	 * wash rather than sit on top of it. The states are exclusive, so the rows
	 * that need telling apart are exactly the ones this is left to.
	 */
	hoverable: { backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } } },
	press: { transform: { default: null, ':active': 'scale(0.99)' } },

	name: {
		color: colors.ink,
		minWidth: 0,
		flexGrow: 1,
		flexShrink: 1,
		flexBasis: '0%',
		fontSize: 14,
		lineHeight: '20px',
	},
	badge: { color: colors.pending, width: 16, height: 16, flexShrink: 0 },
	mine: { color: colors.brand, width: 16, height: 16, flexShrink: 0 },
	count: {
		color: colors.muted,
		flexShrink: 0,
		fontSize: 12,
		lineHeight: '16px',
		fontWeight: 600,
		fontVariantNumeric: 'tabular-nums',
	},

	footnote: { color: colors.faint, marginTop: 12, fontSize: 12, lineHeight: '16px' },

	turnout: { marginTop: 16, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: tint.white5, paddingTop: 12 },
	summary: {
		color: colors.muted,
		fontSize: 12,
		lineHeight: '16px',
		fontWeight: 500,
		fontVariantNumeric: 'tabular-nums',
	},
	faces: { marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 },
	// Faded rather than hidden: the people still to answer are the reason
	// anybody looks at this.
	waiting: { opacity: 0.3 },

	nobody: { color: colors.muted, marginBottom: 4, fontSize: 14, lineHeight: 1.625 },
	result: { marginBottom: 4 },
	winners: { color: colors.ink, fontSize: 18, lineHeight: 1.25, fontWeight: 700 },
	shared: { color: colors.muted, fontSize: 14, lineHeight: '20px', fontWeight: 400 },
	tally: { color: colors.faint, marginTop: 2, fontSize: 12, lineHeight: '16px' },
});

/**
 * Man of the match: the vote while it is open, the result once it is decided.
 *
 * Deliberately shows **no running total**. Until the vote is counted, what is on
 * screen is your own pick and how many people have made one, never who is
 * leading, because a visible lead is a lead people vote for. That is a rule
 * rather than a layout choice: nobody else's pick is readable at all, so this
 * screen could not draw a tally if it wanted to.
 *
 * Turnout is the one thing about a vote in progress that is published, and it is
 * a different question with a different answer: eight names with nothing
 * attached to them is not a leaderboard. What it is instead is the list the
 * group would otherwise reconstruct by asking each other, which is who still
 * hasn't voted.
 *
 * Whoever is looking is not necessarily in it. A game is public to the whole
 * group, so somebody who didn't play sees the same panel with no buttons in it,
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
	/** Who has voted so far. Empty once it is counted. See `Decided`. */
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

	const votesFor = (uid: string) => votes.get(uid) ?? 0;

	// Decided, the list stops being a ballot and becomes a result: the people the
	// group named, most votes first. Everybody else drops off, because a name with
	// nothing beside it says only that nobody picked them, and the team sheet is
	// already on this screen for anyone who wants the full lineup. While the vote
	// is open it is that whole lineup in team order, since there is nothing to
	// rank by that anybody is allowed to see. The sort is stable, so names level
	// on votes keep the team order they were drawn in.
	const ordered = motm
		? candidates.filter(candidate => votesFor(candidate.uid) > 0).sort((a, b) => votesFor(b.uid) - votesFor(a.uid))
		: candidates;

	const live = open && canVote;

	return (
		<section {...stylex.props(surfaces.glass, styles.card)}>
			<div {...stylex.props(styles.head)}>
				<div {...stylex.props(styles.title)}>
					<TrophyIcon {...stylex.props(styles.trophy)} aria-hidden='true' />
					<h2 {...stylex.props(styles.heading)}>Man of the match</h2>
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
				<p {...stylex.props(styles.blurb)}>
					{canVote
						? 'Who stood out? One vote each, and nobody sees the count until it closes.'
						: 'The players are voting. The result appears here when it closes.'}
				</p>
			)}

			{/* The ballot while the vote is open. After it closes, the same rows
			    answer a different question, so they are cut down to the people who
			    have an answer in them and reordered by it. Nothing at all when
			    nobody voted: the line above has already said so. */}
			{ordered.length > 0 && (
				<ul {...stylex.props(styles.ballot)}>
					{ordered.map(candidate => {
						const picked = vote?.votedFor === candidate.uid;
						const won = motm?.winners.includes(candidate.uid) ?? false;
						const count = votesFor(candidate.uid);
						const washed = won || picked;

						return (
							<li key={candidate.uid}>
								<button
									type='button'
									disabled={!live}
									aria-pressed={picked}
									onClick={() => {
										hapticLight();
										onVote(candidate.uid);
									}}
									{...stylex.props(
										styles.option,
										focus.ring,
										won && picked && styles.wonPicked,
										won && !picked && styles.won,
										!won && picked && styles.picked,
										// Not a disabled control once the vote is over.
										// It is a list again, and greying every name
										// would read as something being unavailable
										// rather than finished.
										live && !washed && styles.hoverable,
										live && styles.press
									)}
								>
									<Avatar
										displayName={name(candidate.uid)}
										photoURL={usersByUid.get(candidate.uid)?.photoURL}
										size='sm'
									/>
									<span {...stylex.props(styles.name, utils.truncate)}>{name(candidate.uid)}</span>

									{won && <TrophyIcon {...stylex.props(styles.badge)} aria-hidden='true' />}
									{picked && !motm && (
										<CheckCircleIcon {...stylex.props(styles.mine)} aria-hidden='true' />
									)}

									{/* Counts only exist once it is decided, and by then
									    everybody still on the list has at least one. */}
									{motm && <span {...stylex.props(styles.count)}>{count}</span>}

									<TeamBadge index={candidate.team} size='sm' />
								</button>
							</li>
						);
					})}
				</ul>
			)}

			{open && <Turnout teams={teams} usersByUid={usersByUid} voterUids={voterUids} />}

			{live && (
				<p {...stylex.props(styles.footnote)}>
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
 * deciding whether to nudge the group chat, and a sentence with eleven names in
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
		<div {...stylex.props(styles.turnout)}>
			<p {...stylex.props(styles.summary)}>{summary}</p>

			<ul {...stylex.props(styles.faces)}>
				{[...voted, ...pending].map(uid => {
					const displayName = nameByUid(usersByUid, uid);
					const hasVoted = answered.has(uid);

					return (
						<li key={uid} aria-label={`${displayName}, ${hasVoted ? 'voted' : 'not yet'}`}>
							<Avatar
								displayName={displayName}
								photoURL={usersByUid.get(uid)?.photoURL}
								size='sm'
								sx={!hasVoted && styles.waiting}
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
		return <p {...stylex.props(styles.nobody)}>Nobody voted, so nobody got it this week.</p>;
	}

	const [top] = motm.winners;

	return (
		<div {...stylex.props(styles.result)}>
			<p {...stylex.props(styles.winners)}>
				{motm.winners.map(name).join(' & ')}
				{motm.winners.length > 1 && <span {...stylex.props(styles.shared)}>, shared</span>}
			</p>
			<p {...stylex.props(styles.tally)}>
				{votes.get(top) ?? 0} of {[...votes.values()].reduce((total, count) => total + count, 0)} votes
			</p>
		</div>
	);
};

export default MotmPanel;
