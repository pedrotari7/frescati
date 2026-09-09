'use client';

import { CheckCircleIcon, TrophyIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { AppUser, MotmVote, TournamentMotm, TournamentTeam } from '@shared/types';
import { counted, formatRelative } from '@shared/format';
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

	/*
	 * The result, once there is one.
	 *
	 * A face and a name at the size a name gets announced at, rather than the
	 * 18px line it used to be above a 12px tally. Somebody opening a played game
	 * a week later is after two things, the table and this, and the table can be
	 * worked out from the scorelines directly above it while this cannot be
	 * worked out from anything on the screen at all. It is the trophy's wash and
	 * ring, the same pair the winning row in the list below carries, so the two
	 * read as one answer given twice rather than as two separate claims.
	 */
	podium: {
		marginTop: 12,
		marginBottom: 4,
		display: 'flex',
		alignItems: 'center',
		gap: 14,
		borderRadius: 16,
		backgroundColor: tint.pending10,
		boxShadow: `0 0 0 1px ${tint.pending30}`,
		padding: 14,
	},
	// A tie is one result with two faces in it, so they overlap. Side by side
	// they read as the beginning of a list, which is the next thing down.
	podiumFaces: { display: 'flex', flexShrink: 0 },
	podiumFace: { marginLeft: { default: -14, ':first-child': 0 } },
	podiumWho: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	winners: { color: colors.ink, fontSize: 22, lineHeight: '28px', fontWeight: 700 },
	shared: { color: colors.muted, fontSize: 14, lineHeight: '20px', fontWeight: 400 },
	tally: {
		color: colors.pending,
		marginTop: 2,
		fontSize: 13,
		lineHeight: '18px',
		fontWeight: 600,
		fontVariantNumeric: 'tabular-nums',
	},
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
 * hasn't voted. It stays up after the count, because that list is exactly as
 * interesting on the Friday as it was on the Wednesday and the published totals
 * give the number without the names.
 *
 * Whoever is looking is not necessarily in it. A game is public to the whole
 * group, so somebody who didn't play sees the same panel with no buttons in it,
 * which is the honest state, rather than a control that fails on write.
 *
 * Nobody is on their own ballot, for the same reason. The rules refuse a vote
 * for yourself, and a dead row looks exactly like a live one until somebody taps
 * it, so the name comes off the list instead. It has not left the screen, the
 * turnout strip below is still the whole lineup. Once the vote is counted the
 * list is a result rather than a ballot, and you are back on it if the group
 * named you.
 */
const MotmPanel = ({
	teams,
	usersByUid,
	motm,
	vote,
	voterUids,
	votingUntil,
	now,
	meUid,
	onVote,
}: {
	teams: TournamentTeam[];
	usersByUid: Map<string, AppUser>;
	/** The counted vote, or `null` while it is still open. */
	motm: TournamentMotm | null;
	/** Your own vote, or `null` if you haven't cast one. */
	vote: MotmVote | null;
	/**
	 * Who has voted so far, while the vote is open. Empty once it is counted,
	 * the count deletes the live document and copies the list onto `motm`.
	 */
	voterUids: string[];
	/** When the vote closes, as epoch milliseconds. Absent means it is shut. */
	votingUntil?: number;
	now: Date;
	/** Who is looking, or `null` when nobody is signed in. */
	meUid: string | null;
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

	// Only the team sheet gets a vote, which is what the rules enforce too, and
	// being an admin is not being on the pitch. Read off the lineup this panel is
	// already drawing rather than passed in beside it, so there is one answer to
	// it rather than two that can drift apart.
	const canVote = candidates.some(candidate => candidate.uid === meUid);
	const live = open && canVote;

	// Decided, the list stops being a ballot and becomes a result: the people the
	// group named, most votes first. Everybody else drops off, because a name with
	// nothing beside it says only that nobody picked them, and the team sheet is
	// already on this screen for anyone who wants the full lineup. While the vote
	// is open it is that whole lineup in team order, minus yourself, since there
	// is nothing to rank by that anybody is allowed to see and nothing you are
	// allowed to do with your own name. The sort is stable, so names level on
	// votes keep the team order they were drawn in.
	const ordered = motm
		? candidates.filter(candidate => votesFor(candidate.uid) > 0).sort((a, b) => votesFor(b.uid) - votesFor(a.uid))
		: candidates.filter(candidate => !live || candidate.uid !== meUid);

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
				<Decided motm={motm} usersByUid={usersByUid} name={name} votes={votes} />
			) : (
				<p {...stylex.props(styles.blurb)}>
					{canVote
						? 'Who stood out? One vote each, and not for yourself. Nobody sees the count until it closes.'
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

			{/* While the vote runs this comes off `tournament/motmVoters`, which the
			    count deletes. After it, off the copy on the decision, so the strip
			    stays where it was rather than disappearing at the deadline, which
			    is the moment people start asking who never voted. A game decided
			    before that copy existed has neither, and gets no strip. */}
			{open && <Turnout teams={teams} usersByUid={usersByUid} voterUids={voterUids} />}
			{!open && motm?.voterUids !== undefined && (
				<Turnout teams={teams} usersByUid={usersByUid} voterUids={motm.voterUids} closed />
			)}

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
 * Who answered and who didn't.
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
 * **Drawn after the count too**, from the copy `closeMotmVote` writes onto the
 * decision. Who never got round to it is a question about the week that has
 * just gone as much as about the one still running, and the published totals
 * answer it with a number rather than with names. Four votes, from which four
 * of the fourteen, is anybody's guess. What changes at the deadline is the
 * tense, and that the strip has stopped being a nudge, so nothing here says
 * "yet".
 *
 * A game decided before the turnout was kept has no list at all, which the
 * panel handles by not drawing this rather than by drawing a lineup with nobody
 * in it marked as having voted.
 */
const Turnout = ({
	teams,
	usersByUid,
	voterUids,
	closed = false,
}: {
	teams: TournamentTeam[];
	usersByUid: Map<string, AppUser>;
	voterUids: string[];
	/** Whether the vote has been counted. Changes the tense, nothing else. */
	closed?: boolean;
}) => {
	const { voted, pending } = getMotmTurnout(teams, voterUids);
	const total = voted.length + pending.length;
	const answered = new Set(voted);

	if (total === 0) return null;

	// A counted vote nobody answered is a strip of faded faces under a line that
	// has just said the same thing in words. While it is open the same state is
	// worth drawing, because it is the state somebody is here to change.
	if (closed && voted.length === 0) return null;

	const summary =
		pending.length === 0
			? closed
				? 'Everybody voted'
				: 'Everybody has voted'
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
					const state = hasVoted ? 'voted' : closed ? 'did not vote' : 'not yet';

					return (
						<li key={uid} aria-label={`${displayName}, ${state}`}>
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
 * The result.
 *
 * The one part of the evening the table further down the screen cannot show, so
 * it is drawn as a face and a name rather than as a sentence about them.
 *
 * A tie is stated as a tie rather than resolved: the group produced two names,
 * and they share the rating bonus the same way teams level on every tie-break
 * share a finishing position.
 */
const Decided = ({
	motm,
	usersByUid,
	name,
	votes,
}: {
	motm: TournamentMotm;
	usersByUid: Map<string, AppUser>;
	name: (uid: string) => string;
	votes: Map<string, number>;
}) => {
	if (motm.winners.length === 0) {
		return <p {...stylex.props(styles.nobody)}>Nobody voted, so nobody got it this week.</p>;
	}

	const [top] = motm.winners;
	const cast = [...votes.values()].reduce((total, count) => total + count, 0);

	return (
		<div {...stylex.props(styles.podium)}>
			<div {...stylex.props(styles.podiumFaces)}>
				{motm.winners.map(uid => (
					<Avatar
						key={uid}
						displayName={name(uid)}
						photoURL={usersByUid.get(uid)?.photoURL}
						size='lg'
						sx={styles.podiumFace}
					/>
				))}
			</div>

			<div {...stylex.props(styles.podiumWho)}>
				<p {...stylex.props(styles.winners)}>
					{motm.winners.map(name).join(' & ')}
					{motm.winners.length > 1 && <span {...stylex.props(styles.shared)}>, shared</span>}
				</p>
				{/* Everybody level on the most votes is level by construction, so
				    one number covers a winner and a tie alike. */}
				<p {...stylex.props(styles.tally)}>
					{votes.get(top) ?? 0} of {counted(cast, 'vote')}
				</p>
			</div>
		</div>
	);
};

export default MotmPanel;
