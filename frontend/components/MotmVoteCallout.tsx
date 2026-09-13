'use client';

import Link from 'next/link';
import { ChevronRightIcon, TrophyIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { Game, Season } from '@shared/types';
import { formatGameDateLong, formatRelative } from '@shared/format';
import { isMotmVotingOpen } from '@shared/motm';
import { useMyMotmVote, useTournamentTeams, useUsersByUid } from '../hooks/useData';
import { useAuth } from '../lib/auth';
import { nameByUid } from '../lib/people';
import StatusPill from './StatusPill';
import { bp, colors, tint } from '../app/tokens.stylex';
import { animations, elevation, focus, nudge, surfaces, utils } from '../lib/styles';

const styles = stylex.create({
	card: { display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 24, padding: 20 },

	/*
	 * The wash the card takes while the question is out to the person reading
	 * it, and only then. Amber is what this app paints something waiting on an
	 * answer, so it is the colour the trophy and the countdown beside it are
	 * already in. Once you have voted the card keeps the facts and loses the
	 * colour: one that stays loud for two days after you have answered is one
	 * people learn to scroll past.
	 */
	live: { backgroundColor: tint.pending8, borderColor: tint.pending25 },

	head: { display: 'flex', alignItems: 'center', gap: 8 },
	trophy: { color: colors.pending, width: 20, height: 20, flexShrink: 0 },
	when: {
		color: colors.ink,
		minWidth: 0,
		flexGrow: 1,
		flexBasis: '0%',
		fontSize: 16,
		lineHeight: '24px',
		fontWeight: 600,
	},

	blurb: { color: colors.muted, fontSize: 14, lineHeight: 1.625 },
	who: { color: colors.ink, fontWeight: 600 },

	/*
	 * A link drawn as a button, so it is the size of the thing being asked for.
	 * Built the way `Button`'s `danger` variant is, a wash, its own colour and a
	 * border in between, rather than the solid fill `primary` uses. The In pair
	 * on the card above this one is the screen's solid button, and two of those
	 * stacked is two things each claiming to be the next thing to do.
	 */
	vote: {
		display: 'flex',
		height: 44,
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		borderRadius: 12,
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: tint.pending30,
		backgroundColor: { default: tint.pending15, [bp.hover]: { default: null, ':hover': tint.pending25 } },
		color: colors.pending,
		fontSize: 14,
		lineHeight: '20px',
		fontWeight: 600,
		transitionProperty: 'background-color, transform',
		transitionDuration: '0.2s',
		transform: { default: null, ':active': 'scale(0.99)' },
	},

	/* The way through for everybody with nothing outstanding, which is the people
	   who have voted and the people who were never on the pitch. */
	more: {
		marginInline: -8,
		marginBlock: -4,
		display: 'flex',
		alignItems: 'center',
		gap: 8,
		borderRadius: 12,
		paddingInline: 8,
		paddingBlock: 8,
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	moreLabel: {
		color: colors.brand,
		minWidth: 0,
		flexGrow: 1,
		flexBasis: '0%',
		fontSize: 14,
		lineHeight: '20px',
		fontWeight: 600,
	},
	moreIcon: { color: colors.faint, width: 16, height: 16, flexShrink: 0 },
});

/**
 * The man-of-the-match vote, on the screen the app opens on, while it is still
 * running.
 *
 * A played game with its vote open used to sit here as an ordinary game row
 * carrying a "Vote open" pill, which states the fact and asks for nothing. The
 * vote is the one thing on a season's home page with a deadline on it and the
 * only one that goes away unanswered, so it gets a card and a button rather
 * than a row and a pill, directly under the next game.
 *
 * Loud only while it is asking **you** something. The three stances are worth
 * spelling out, because the difference between them is the whole point:
 *
 * - You played and haven't voted: the amber wash and the button. This is the
 *   state the card exists for.
 * - You played and have voted: the same card with the colour off, saying who
 *   you picked and offering the way back in to change your mind.
 * - You didn't play: no ask at all, because there is nothing you may do. The
 *   vote is still worth announcing, the result lands in a couple of days and it
 *   belongs to the group rather than to the lineup, so the card stays and the
 *   button goes.
 *
 * The two listeners behind that, the lineup and your own vote, are why this is
 * a component rather than another `GameRow`, and why it is drawn per voting
 * game rather than once for all of them. `groupGames` holds a game in `voting`
 * for the `MOTM_VOTING_HOURS` its window lasts, so on a weekly season there is
 * one of these, occasionally two, never a list.
 *
 * It leads to the team sheet rather than to the game, because that is where the
 * ballot is and where the notification about it lands. Taking the vote on this
 * card instead would be `MotmPanel`'s ballot drawn a second time, over a lineup
 * the season's home page has no other reason to know the names of.
 */
const MotmVoteCallout = ({ game, season, now }: { game: Game; season: Season; now: Date }) => {
	const { user } = useAuth();
	const uid = user?.uid ?? null;

	const { teams, loading: teamsLoading } = useTournamentTeams(season.id, game.id);
	const { vote, loading: voteLoading } = useMyMotmVote(season.id, game.id, uid);
	const { usersByUid } = useUsersByUid();

	// The same window `groupGames` read to put this game in front of the ones
	// still to come, so the season's home page never sees this `null`. It is here
	// anyway. Without it the card counts down to a deadline that has passed or
	// was never set, and the countdown below needs a non-null assertion to
	// compile.
	const votingUntil = game.motmVotingUntilMillis;
	if (votingUntil === undefined || !isMotmVotingOpen(votingUntil, now.getTime())) return null;

	// Until both listeners have landed the card must not claim either stance.
	// Asking somebody who has already voted to vote, for the frame before their
	// vote arrives, is the wrong way round to be wrong, so it holds the neutral
	// shape until it knows, the one with nothing in it addressed to anybody.
	const settled = !teamsLoading && !voteLoading;

	// The lineup decides who may vote, which is what the rules check too. Being
	// an admin is not being on the pitch, and neither is having said you were
	// coming. The confirmed team sheet is the only record of who played.
	const played = !!uid && (teams?.teams ?? []).some(team => team.uids.includes(uid));
	const asking = settled && played && !vote;

	const href = `/s/${season.id}/g/${game.id}/tournament`;

	return (
		<div {...stylex.props(surfaces.glass, elevation.glass, animations.rise, styles.card, asking && styles.live)}>
			<div {...stylex.props(styles.head)}>
				<TrophyIcon {...stylex.props(styles.trophy)} aria-hidden='true' />

				{/* Which game. The card is about one that has been played and the
				    hero above it is about one that hasn't. */}
				<h3 {...stylex.props(styles.when, utils.truncate)}>
					{formatGameDateLong(game.kickoff, season.slot.timezone)}
				</h3>

				{/* A countdown rather than a date. How long is left is the only
				    thing about the deadline that changes what anybody does. */}
				<StatusPill tone='pending'>
					Closes {formatRelative(new Date(votingUntil).toISOString(), now)}
				</StatusPill>
			</div>

			{settled && !played && (
				<p {...stylex.props(styles.blurb)}>The players are voting. The result is on the team sheet.</p>
			)}

			{settled && played && !vote && (
				<p {...stylex.props(styles.blurb)}>
					Who stood out? One vote each, and nobody sees the count until it closes.
				</p>
			)}

			{settled && played && vote && (
				<p {...stylex.props(styles.blurb)}>
					You voted for <span {...stylex.props(styles.who)}>{nameByUid(usersByUid, vote.votedFor)}</span>.
				</p>
			)}

			{asking ? (
				<Link href={href} {...stylex.props(focus.ring, styles.vote)}>
					Vote
				</Link>
			) : (
				<Link href={href} {...stylex.props(focus.ring, nudge.row, styles.more)}>
					<span {...stylex.props(styles.moreLabel)}>
						{settled && played ? 'Change your vote' : 'See the team sheet'}
					</span>
					<ChevronRightIcon {...stylex.props(styles.moreIcon, nudge.chevron)} aria-hidden='true' />
				</Link>
			)}
		</div>
	);
};

export default MotmVoteCallout;
