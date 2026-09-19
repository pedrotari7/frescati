'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import { getHeadToHead, getHeadToHeadRun } from '@shared/headToHead';
import type { HeadToHeadGame } from '@shared/headToHead';
import { toDisplayRating } from '@shared/rating';
import { counted, formatGameDate, placeLabel } from '@shared/format';
import type { PlayerLink } from '@shared/player';
import type { AppUser, Season } from '@shared/types';
import { usePlayerScreen } from '../../../../../../hooks/useData';
import { displayNameOf } from '../../../../../../lib/people';
import { useSeasonScope } from '../../../../../../components/SeasonScope';
import { seasonNavItems } from '../../../../../../components/BottomNav';
import Stat from '../../../../../../components/Stat';
import PageShell from '../../../../../../components/PageShell';
import Skeleton from '../../../../../../components/Skeleton';
import EmptyState from '../../../../../../components/EmptyState';
import Avatar from '../../../../../../components/Avatar';
import Button from '../../../../../../components/Button';
import StatusPill from '../../../../../../components/StatusPill';
import { SectionHeading } from '../../../../../../components/Section';
import { bp, colors, tint } from '../../../../../tokens.stylex';
import { surfaces, utils } from '../../../../../../lib/styles';

const styles = stylex.create({
	page: { display: 'flex', flexDirection: 'column', gap: 16, padding: 16 },

	caption: {
		color: colors.faint,
		fontSize: 11,
		fontWeight: 600,
		letterSpacing: '0.05em',
		textTransform: 'uppercase',
	},

	/* The two of them either side of the score. Deliberately a grid rather than
	   a flex row: the middle column is sized by its content and the two outer
	   ones share what is left equally, so a long name and a short one still put
	   the score down the centre of the card. */
	versus: {
		display: 'grid',
		gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
		alignItems: 'center',
		gap: 12,
		borderRadius: 24,
		padding: 20,
	},
	side: { display: 'flex', minWidth: 0, flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' },
	sideName: { color: colors.ink, maxWidth: '100%', fontSize: 14, lineHeight: '20px', fontWeight: 600 },
	sideRating: { color: colors.faint, fontSize: 12, lineHeight: '16px', fontVariantNumeric: 'tabular-nums' },

	score: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
	scoreLine: { display: 'flex', alignItems: 'baseline', gap: 6 },
	scoreNum: {
		color: colors.ink,
		fontSize: 30,
		lineHeight: '36px',
		fontWeight: 700,
		fontVariantNumeric: 'tabular-nums',
	},
	/* Draws are the quiet number of the three: they belong to neither side, and
	   at the same weight as the wins they read as a third player. */
	scoreDrawn: { color: colors.faint, fontSize: 18, lineHeight: '24px', fontWeight: 700 },
	scoreDash: { color: colors.faint, fontSize: 18, lineHeight: '24px' },

	stats: {
		display: 'grid',
		gridTemplateColumns: { default: 'repeat(2, minmax(0, 1fr))', [bp.sm]: 'repeat(4, minmax(0, 1fr))' },
		gap: 12,
	},

	headingRow: {
		marginBottom: 8,
		display: 'flex',
		alignItems: 'baseline',
		justifyContent: 'space-between',
		gap: 8,
		paddingInline: 4,
	},

	list: { overflow: 'hidden', borderRadius: 24 },
	item: { borderTopWidth: { default: 1, ':first-child': 0 }, borderTopStyle: 'solid', borderTopColor: tint.white6 },
	row: {
		display: 'flex',
		alignItems: 'center',
		gap: 12,
		paddingInline: 16,
		paddingBlock: 12,
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},

	/* The verdict, as one word in a fixed column so the dates below it line up.
	   Won and lost borrow the palette the form guide uses; a draw takes the
	   muted one rather than a colour of its own, because it is the absence of a
	   result and not a third kind of one. */
	verdict: {
		display: 'flex',
		width: 52,
		flexShrink: 0,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 8,
		paddingBlock: 4,
		fontSize: 11,
		fontWeight: 700,
		letterSpacing: '0.05em',
		textTransform: 'uppercase',
	},
	verdictWon: { backgroundColor: tint.brand15, color: colors.brand },
	verdictDrew: { backgroundColor: tint.white6, color: colors.muted },
	verdictLost: { backgroundColor: tint.out12, color: colors.out },

	/* A flex column rather than a bare block: the two lines inside are spans,
	   and only becoming flex items blockifies them, without which the second
	   one's `marginTop` does nothing and its truncation has no box to clip. */
	rowBody: { display: 'flex', minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%', flexDirection: 'column' },
	rowWhen: { color: colors.ink, fontSize: 14, lineHeight: '20px' },
	rowSide: { color: colors.faint, marginTop: 2, fontSize: 12, lineHeight: '16px' },
	rowPlaces: {
		color: colors.faint,
		flexShrink: 0,
		fontSize: 12,
		lineHeight: '16px',
		fontVariantNumeric: 'tabular-nums',
	},

	note: { color: colors.faint, marginTop: 12, paddingInline: 4, fontSize: 12, lineHeight: 1.625 },
	more: { marginTop: 12 },
});

/**
 * Two players, and every game they have been in together.
 *
 * Opened from a row in a profile's "Played with" list, which shows the same
 * two fractions this screen opens with. Those numbers are the reason it exists:
 * the list can say 4/7 and has nowhere to put the seven games behind it, which
 * is the half anybody looking at 4/7 actually wants.
 *
 * Nothing new is stored and nothing is queried that a profile does not already
 * fetch. `usePlayerLedger` returns every rated game the first player appeared
 * in, and the second player is in those entries or has never shared one.
 * `shared/headToHead.ts` does the reading.
 */

/** Games listed before the list asks whether you really want the rest. */
const INITIAL_GAMES = 12;

/**
 * One of the two, over the score.
 *
 * A link, because this screen is now the way into the other player's record:
 * the row it was opened from used to go straight there, and the profile is one
 * tap from here rather than none.
 */
const Side = ({ player, uid }: { player: AppUser | null; uid: string }) => {
	const name = displayNameOf(player);

	return (
		<Link href={`/u/${uid}`} {...stylex.props(styles.side)}>
			<Avatar displayName={name} photoURL={player?.photoURL} size='lg' />
			<span {...stylex.props(styles.sideName, utils.truncate)}>{name}</span>
			<span {...stylex.props(styles.sideRating)}>
				{player?.rating ? toDisplayRating(player.rating.elo) : '—'}
			</span>
		</Link>
	);
};

const VERDICT = { won: 'Won', drew: 'Level', lost: 'Lost' } as const;

/**
 * One game the two were both in.
 *
 * The verdict is written from the first player's point of view throughout, the
 * same way round as the score above it, because a screen that swapped
 * perspective halfway down would be unreadable. A game on the same team says so
 * rather than pretending to be a meeting.
 */
const GameRow = ({ game, timezone, theirName }: { game: HeadToHeadGame; timezone: string; theirName: string }) => (
	<li {...stylex.props(styles.item)}>
		<Link href={`/s/${game.seasonId}/g/${game.gameId}/tournament`} {...stylex.props(styles.row)}>
			<span
				{...stylex.props(
					styles.verdict,
					game.result === 'won' && styles.verdictWon,
					game.result === 'drew' && styles.verdictDrew,
					game.result === 'lost' && styles.verdictLost
				)}
			>
				{VERDICT[game.result]}
			</span>

			<span {...stylex.props(styles.rowBody)}>
				<span {...stylex.props(styles.rowWhen)}>{formatGameDate(game.kickoff, timezone)}</span>
				<span {...stylex.props(styles.rowSide, utils.truncate)}>
					{game.together ? `Same team as ${theirName}` : `Against ${theirName}`}
				</span>
			</span>

			{/* Both finishing places, which is what the verdict is read off, and
			    the only thing on the row that explains a level finish between
			    two teams that both came second. A shared team has one place
			    between them, so there is nothing to compare. */}
			<span {...stylex.props(styles.rowPlaces)}>
				{game.together
					? placeLabel(game.position)
					: `${placeLabel(game.position)} v ${placeLabel(game.theirPosition)}`}
			</span>
		</Link>
	</li>
);

/**
 * Wins, draws, losses, in that order and from the first player's side, which is
 * the order the whole screen is written in.
 *
 * Zeroes where there is no link, because the card above the fold is drawn
 * either way: a pairing nobody can say anything about still gets two faces and
 * a 0-0-0 between them rather than a gap.
 */
const Scoreline = ({ link }: { link: PlayerLink | null }) => (
	<div {...stylex.props(styles.score)}>
		<span {...stylex.props(styles.scoreLine)}>
			<span {...stylex.props(styles.scoreNum)}>{link?.beat ?? 0}</span>
			<span {...stylex.props(styles.scoreDash)}>-</span>
			<span {...stylex.props(styles.scoreDrawn)}>{link?.drewWith ?? 0}</span>
			<span {...stylex.props(styles.scoreDash)}>-</span>
			<span {...stylex.props(styles.scoreNum)}>{link?.lostTo ?? 0}</span>
		</span>
		<span {...stylex.props(styles.caption)}>W D L</span>
	</div>
);

/**
 * Everything the two of them have to show for it: the four numbers, the run,
 * and every game.
 *
 * A component rather than the long arm of a ternary inside the page. Almost all
 * of this screen's branching is here, and none of it was nested any less for
 * living in `HeadToHeadPage`, which is what put that function over the
 * complexity ceiling. It also keeps `showAll` beside the button that sets it
 * and the list it trims.
 */
const SharedGames = ({
	link,
	games,
	playerName,
	theirName,
	seasonsById,
}: {
	link: PlayerLink;
	games: HeadToHeadGame[];
	playerName: string;
	theirName: string;
	seasonsById: Map<string, Season>;
}) => {
	const [showAll, setShowAll] = useState(false);

	const run = useMemo(() => getHeadToHeadRun(games), [games]);
	const listed = showAll ? games : games.slice(0, INITIAL_GAMES);

	return (
		<>
			<div {...stylex.props(styles.stats)}>
				<Stat
					label='Met'
					value={String(link.against)}
					hint={link.against === 1 ? 'on opposite teams' : 'times on opposite teams'}
				/>
				<Stat
					label='Together'
					value={String(link.together)}
					hint={link.together === 1 ? 'game on one team' : 'games on one team'}
				/>
				<Stat
					label='Won together'
					value={link.together === 0 ? '—' : `${link.wonTogether}/${link.together}`}
					hint={link.together === 0 ? 'never on one team' : 'as teammates'}
				/>
				<Stat label='Shared' value={String(link.shared)} hint='games in total' />
			</div>

			<section>
				<div {...stylex.props(styles.headingRow)}>
					<SectionHeading>Every game ({games.length})</SectionHeading>

					{/* Only while there is a run to name. A "0 in a row" on a
					    pairing that trades wins every week is a pill saying
					    nothing. */}
					{run && run.count > 1 && (
						<StatusPill tone={run.result === 'won' ? 'brand' : 'out'}>
							{run.count} {run.result === 'won' ? 'wins' : 'losses'} in a row
						</StatusPill>
					)}
				</div>

				<ul {...stylex.props(surfaces.glass, styles.list)}>
					{listed.map(game => (
						<GameRow
							key={game.gameId}
							game={game}
							theirName={theirName}
							timezone={seasonsById.get(game.seasonId)?.slot.timezone ?? 'UTC'}
						/>
					))}
				</ul>

				<p {...stylex.props(styles.note)}>
					Written from {playerName}&apos;s side throughout. On opposite teams a game is won by finishing above
					the other; on the same team it is won by finishing top, so both of them win it or neither does. A
					run counts meetings only, since a game on one team settles nothing either way.
				</p>

				{games.length > INITIAL_GAMES && (
					<Button variant='secondary' fullWidth sx={styles.more} onClick={() => setShowAll(!showAll)}>
						{showAll ? 'Show fewer' : `Show all ${counted(games.length, 'game')}`}
					</Button>
				)}
			</section>
		</>
	);
};

const HeadToHeadPage = ({ params }: { params: Promise<{ uid: string; otherUid: string }> }) => {
	const { uid, otherUid } = use(params);
	const { seasonId } = useSeasonScope();
	const { users, player, entries, seasonsById, loading } = usePlayerScreen(uid);

	const other = users.find(candidate => candidate.uid === otherUid) ?? null;

	const { link, games } = useMemo(() => getHeadToHead(entries, uid, otherUid), [entries, uid, otherUid]);

	// A profile's parent, not the season's home page. This screen only ever
	// hangs off the "Played with" list, so up and back agree for once, and the
	// chevron still goes back the way it came wherever there is a way. See
	// `AppHistory`.
	const shell = {
		navItems: seasonId ? seasonNavItems(seasonId) : undefined,
		backHref: `/u/${uid}`,
	};

	if (loading) {
		return (
			<PageShell title='Head to head' {...shell}>
				<Skeleton />
			</PageShell>
		);
	}

	if (!player || !other) {
		return (
			<PageShell title='Head to head' {...shell}>
				<EmptyState title='Player not found' message='Nobody has signed in with this account.' />
			</PageShell>
		);
	}

	const playerName = displayNameOf(player);
	const theirName = displayNameOf(other);

	return (
		<PageShell title='Head to head' subtitle={`${playerName} and ${theirName}`} {...shell}>
			<div {...stylex.props(styles.page)}>
				<section {...stylex.props(surfaces.glass, styles.versus)}>
					<Side player={player} uid={uid} />
					<Scoreline link={link} />
					<Side player={other} uid={otherUid} />
				</section>

				{link === null ? (
					<EmptyState
						title='Never played together'
						message={`${playerName} and ${theirName} have not been in a confirmed game with each other, or the games they shared were rated before the app recorded who was on which team.`}
					/>
				) : (
					<SharedGames
						link={link}
						games={games}
						playerName={playerName}
						theirName={theirName}
						seasonsById={seasonsById}
					/>
				)}
			</div>
		</PageShell>
	);
};

export default HeadToHeadPage;
