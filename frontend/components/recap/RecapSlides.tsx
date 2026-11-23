'use client';

import type { ComponentType, ReactNode, SVGProps } from 'react';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import {
	ArrowTrendingUpIcon,
	CalendarDaysIcon,
	ClockIcon,
	FaceFrownIcon,
	FireIcon,
	NoSymbolIcon,
	TrophyIcon,
} from '@heroicons/react/24/outline';
import type { Award, AwardsRecap, BanterRecap, ClubRecap, MatchHighlight, PersonalRecap } from '@shared/recap';
import type { Season } from '@shared/types';
import { toDisplayMovement } from '@shared/leaderboard';
import { toDisplayRating } from '@shared/rating';
import { counted, formatGameDate, placeLabel, signed } from '@shared/format';
import { colors, tint } from '../../app/tokens.stylex';
import Confetti from './Confetti';
import CountUp from './CountUp';
import Podium from './Podium';
import Sparkline from './Sparkline';
import { glow, motion } from './motion';
import type { Tone } from './motion';

const styles = stylex.create({
	eyebrow: {
		color: colors.brand,
		fontSize: 13,
		lineHeight: '16px',
		fontWeight: 700,
		letterSpacing: '0.08em',
		textTransform: 'uppercase',
	},
	title: { color: colors.ink, fontSize: 36, lineHeight: 1.05, fontWeight: 800, marginTop: 8 },
	content: { display: 'flex', flexDirection: 'column' },
	/* Two lights drifting behind the slide, past its edges, clipped by the stage. */
	backdrop: { position: 'absolute', inset: -80, zIndex: -1, overflow: 'hidden' },
	orb: { position: 'absolute', width: 340, height: 340, borderRadius: 9999 },
	orbHigh: { top: 0, left: -40 },
	orbLow: { bottom: 0, right: -60, animationDelay: '-4s' },
	medal: {
		position: 'relative',
		alignSelf: 'flex-start',
		width: 72,
		height: 72,
		marginBottom: 20,
		display: 'grid',
		placeItems: 'center',
	},
	ring: {
		position: 'absolute',
		inset: 0,
		borderRadius: 9999,
		backgroundImage: `conic-gradient(${colors.gold}, ${tint.gold30}, ${colors.flare}, ${tint.gold30}, ${colors.gold})`,
	},
	ringHole: { position: 'absolute', inset: 3, borderRadius: 9999, backgroundColor: colors.surface },
	medalIcon: { position: 'relative', width: 34, height: 34, color: colors.gold },
	body: { color: colors.muted, fontSize: 16, lineHeight: 1.5, marginTop: 12 },
	badge: {
		alignSelf: 'flex-start',
		marginTop: 16,
		paddingBlock: 4,
		paddingInline: 10,
		borderRadius: 9999,
		backgroundColor: tint.pending15,
		color: colors.pending,
		fontSize: 12,
		fontWeight: 700,
	},
	grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 24 },
	stat: { borderRadius: 16, padding: 14, backgroundColor: tint.white6 },
	statValue: {
		color: colors.ink,
		fontSize: 28,
		lineHeight: 1.1,
		fontWeight: 800,
		fontVariantNumeric: 'tabular-nums',
	},
	statLabel: { color: colors.muted, fontSize: 13, marginTop: 4 },
	list: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24, padding: 0, listStyle: 'none' },
	row: {
		display: 'flex',
		alignItems: 'baseline',
		justifyContent: 'space-between',
		gap: 12,
		borderRadius: 14,
		paddingBlock: 12,
		paddingInline: 14,
		backgroundColor: tint.white6,
		color: colors.ink,
		textDecoration: 'none',
	},
	/*
	 * The slide lets taps fall through to the story, and a link has to catch its
	 * own, which takes that patch of screen away from Next. So only the goodbye
	 * has one, where there is no next slide to lose.
	 */
	link: { pointerEvents: 'auto' },
	rowLabel: { color: colors.muted, fontSize: 14 },
	rowValue: { color: colors.ink, fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
});

/** "Anna", "Anna and Bosse", "Anna, Bosse and Cia". */
const joinNames = (names: string[]): string =>
	names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** Where the slide's own content starts, after its eyebrow and title have landed. */
const CONTENT_MS = 260;

/** How far apart the items of a list or grid come in. */
const STAGGER_MS = 100;

const Backdrop = ({ tone }: { tone: Tone }) => (
	<div aria-hidden='true' {...stylex.props(styles.backdrop, motion.rise)}>
		<span {...stylex.props(styles.orb, styles.orbHigh, glow[tone], motion.drift)} />
		<span {...stylex.props(styles.orb, styles.orbLow, glow[tone], motion.drift)} />
	</div>
);

/** An award's icon in a turning ring, which pops in before the name does. */
const Medal = ({ icon: Glyph }: { icon: Icon }) => (
	<div aria-hidden='true' {...stylex.props(styles.medal, motion.pop)}>
		<span {...stylex.props(styles.ring, motion.turn)} />
		<span {...stylex.props(styles.ringHole)} />
		<Glyph {...stylex.props(styles.medalIcon)} />
	</div>
);

/**
 * One slide: the light behind it, then the eyebrow, the title and whatever
 * else it has, each landing a beat after the last. An award adds its medal
 * and lets the light catch the winner's name; the opening and the goodbye
 * throw confetti.
 */
const Slide = ({
	eyebrow,
	title,
	tone = 'brand',
	icon,
	confetti = false,
	children,
}: {
	eyebrow: string;
	title: string;
	tone?: Tone;
	icon?: Icon;
	confetti?: boolean;
	children?: ReactNode;
}) => (
	<>
		<Backdrop tone={tone} />
		{confetti && <Confetti />}
		{icon && <Medal icon={icon} />}
		<p {...stylex.props(styles.eyebrow, motion.rise)}>{eyebrow}</p>
		<h2 {...stylex.props(styles.title, motion.pop, motion.after(90))}>
			{/* Its own span, because the shine is an animation too and would replace the pop. */}
			<span {...stylex.props(icon && motion.shine)}>{title}</span>
		</h2>
		<div {...stylex.props(styles.content, motion.rise, motion.after(CONTENT_MS))}>{children}</div>
	</>
);

const Stat = ({
	value,
	label,
	format,
	order,
}: {
	value: number;
	label: string;
	format?: (value: number) => string;
	order: number;
}) => (
	<div {...stylex.props(styles.stat, motion.pop, motion.after(CONTENT_MS + order * STAGGER_MS))}>
		<p {...stylex.props(styles.statValue)}>
			<CountUp value={value} format={format} />
		</p>
		<p {...stylex.props(styles.statLabel)}>{label}</p>
	</div>
);

const Row = ({ label, value, href, order = 0 }: { label: string; value: string; href?: string; order?: number }) => {
	const content = (
		<>
			<span {...stylex.props(styles.rowLabel)}>{label}</span>
			<span {...stylex.props(styles.rowValue)}>{value}</span>
		</>
	);

	return (
		<li {...stylex.props(motion.slideIn, motion.after(CONTENT_MS + order * STAGGER_MS))}>
			{href ? (
				<Link href={href} {...stylex.props(styles.row, styles.link)}>
					{content}
				</Link>
			) : (
				<div {...stylex.props(styles.row)}>{content}</div>
			)}
		</li>
	);
};

export interface SlideContext {
	season: Season;
	club: ClubRecap;
	awards: AwardsRecap;
	banter: BanterRecap;
	personal: PersonalRecap | null;
	/** The person the personal slides are about is the one reading them. */
	mine: boolean;
	nameOf: (uid: string) => string;
	/** Set on an app admin's early look: how much of the season it covers. */
	preview: { rated: number; total: number } | null;
}

const score = (highlight: MatchHighlight) => `${highlight.match.scoreA}–${highlight.match.scoreB}`;

const intro = ({ season, club, preview }: SlideContext) => (
	<Slide key='intro' eyebrow={season.name} title="That's a wrap" confetti>
		<p {...stylex.props(styles.body)}>
			{counted(club.gamesPlayed, 'game')} at {season.venue.name}. Here is how it went.
		</p>
		{preview && (
			<p {...stylex.props(styles.badge)}>
				Preview, {preview.rated} of {preview.total} games
			</p>
		)}
	</Slide>
);

const numbers = ({ club }: SlideContext) => (
	<Slide key='numbers' eyebrow='The club' title='The season in numbers'>
		<div {...stylex.props(styles.grid)}>
			<Stat order={0} value={club.gamesPlayed} label='Games played' />
			<Stat order={1} value={club.totalGoals} label='Goals' />
			<Stat order={2} value={club.players} label='Players' />
			<Stat order={3} value={club.extras} label='Extras' />
			<Stat order={4} value={club.averageTurnout} label='Average turnout' />
		</div>
	</Slide>
);

const podium = ({ club, nameOf }: SlideContext) => (
	<Slide key='podium' eyebrow='The table' title='The podium' tone='gold'>
		<Podium rows={club.podium} nameOf={nameOf} />
	</Slide>
);

const remembered = ({ season, club }: SlideContext) => {
	const date = (kickoff: string) => formatGameDate(kickoff, season.slot.timezone);
	const matches = (
		[
			['Most goals', club.highestScoring],
			['Biggest win', club.biggestWin],
			['Closest finish', club.closestFinish],
		] as [string, MatchHighlight | null][]
	).filter((pair): pair is [string, MatchHighlight] => !!pair[1]);

	return (
		<Slide key='games' eyebrow='The games' title='Games to remember'>
			<ul {...stylex.props(styles.list)}>
				{matches.map(([label, highlight], order) => (
					<Row
						key={label}
						order={order}
						label={`${label}, ${date(highlight.kickoff)}`}
						value={score(highlight)}
					/>
				))}
				{club.bestTurnout && (
					<Row
						order={matches.length}
						label={`Biggest turnout, ${date(club.bestTurnout.kickoff)}`}
						value={counted(club.bestTurnout.turnout, 'player')}
					/>
				)}
			</ul>
		</Slide>
	);
};

interface AwardSpec {
	key: string;
	eyebrow: string;
	award: Award | null;
	icon: Icon;
	detail: (value: number) => string;
	extra?: ReactNode;
}

const awardSlide = (
	{ key, eyebrow, award, icon, detail, extra }: AwardSpec,
	tone: Tone,
	nameOf: SlideContext['nameOf']
) =>
	award && (
		<Slide key={key} eyebrow={eyebrow} title={joinNames(award.uids.map(nameOf))} tone={tone} icon={icon}>
			<p {...stylex.props(styles.body)}>{detail(award.value)}</p>
			{extra}
		</Slide>
	);

/* The awards in gold, the banter in a louder pink, so the turn into teasing shows. */
const awardSlides = ({ awards, nameOf }: SlideContext): ReactNode[] =>
	(
		[
			{
				key: 'motm',
				eyebrow: 'Man of the match',
				award: awards.motm,
				icon: TrophyIcon,
				detail: value => `Voted best on the pitch ${counted(value, 'time')}.`,
			},
			{
				key: 'iron',
				eyebrow: 'Iron man',
				award: awards.ironMan,
				icon: CalendarDaysIcon,
				detail: value => `Turned up for ${counted(value, 'game')}.`,
				extra: awards.perfectAttendance.length > 0 && (
					<p {...stylex.props(styles.body)}>
						Never missed one: {joinNames(awards.perfectAttendance.map(nameOf))}.
					</p>
				),
			},
			{
				key: 'climber',
				eyebrow: 'Biggest climber',
				award: awards.climber,
				icon: ArrowTrendingUpIcon,
				detail: value => `${signed(toDisplayMovement(value))} on the rating.`,
			},
			{
				key: 'streak',
				eyebrow: 'Longest winning run',
				award: awards.streak,
				icon: FireIcon,
				detail: value => `${counted(value, 'win')} in a row.`,
			},
		] satisfies AwardSpec[]
	).map(spec => awardSlide(spec, 'gold', nameOf));

const banterSlides = ({ banter, nameOf }: SlideContext): ReactNode[] =>
	(
		[
			{
				key: 'noshows',
				eyebrow: 'Most no-shows',
				award: banter.noShows,
				icon: NoSymbolIcon,
				detail: value => `Said they were in and didn't show, ${counted(value, 'time')}.`,
			},
			{
				key: 'lucy',
				eyebrow: 'Last-minute Lucy',
				award: banter.lastMinute,
				icon: ClockIcon,
				detail: value => `${counted(value, 'answer')} given or changed in the 24 hours before kickoff.`,
			},
			{
				key: 'spoon',
				eyebrow: 'Wooden spoon',
				award: banter.woodenSpoon,
				icon: FaceFrownIcon,
				detail: value => `Bottom of the table on ${counted(value, 'win')}. There is always next season.`,
			},
		] satisfies AwardSpec[]
	).map(spec => awardSlide(spec, 'flare', nameOf));

const personalSlides = ({ season, personal, mine, nameOf }: SlideContext): ReactNode[] => {
	if (!personal) return [];

	const whose = mine ? 'Your season' : `${nameOf(personal.row.uid)}'s season`;
	const [start, end] = [personal.journey[0], personal.journey[personal.journey.length - 1]];

	return [
		<Slide key='line' eyebrow={whose} title={placeLabel(personal.row.position)} tone='sky'>
			<div {...stylex.props(styles.grid)}>
				<Stat order={0} value={personal.row.appearances} label='Games' />
				<Stat order={1} value={personal.row.wins} label='Wins' />
				<Stat
					order={2}
					value={Math.round(personal.winRate * 100)}
					label='Win rate'
					format={value => `${value}%`}
				/>
				<Stat order={3} value={personal.motmVotes} label='Man-of-the-match votes' />
			</div>
		</Slide>,
		<Slide key='journey' eyebrow={whose} title={`${toDisplayRating(start)} to ${toDisplayRating(end)}`} tone='sky'>
			<Sparkline elos={personal.journey} />
		</Slide>,
		<Slide key='people' eyebrow={whose} title='The people' tone='sky'>
			<ul {...stylex.props(styles.list)}>
				{personal.bestTeammate && (
					<Row
						order={0}
						label='Won most with'
						value={`${nameOf(personal.bestTeammate.uid)}, ${personal.bestTeammate.wonTogether}`}
					/>
				)}
				{personal.nemesis && (
					<Row
						order={1}
						label='Nemesis'
						value={`${nameOf(personal.nemesis.uid)}, ${personal.nemesis.beat}–${personal.nemesis.lostTo}`}
					/>
				)}
				{personal.bestGame && (
					<Row
						order={2}
						label={`Best game, ${formatGameDate(personal.bestGame.kickoff, season.slot.timezone)}`}
						value={signed(toDisplayMovement(personal.bestGame.gain))}
					/>
				)}
			</ul>
		</Slide>,
	];
};

const outro = ({ season }: SlideContext) => (
	<Slide key='outro' eyebrow={season.name} title='See you next season' confetti>
		<ul {...stylex.props(styles.list)}>
			<Row label='The full table' value='Open' href={`/s/${season.id}/table`} />
		</ul>
	</Slide>
);

/**
 * The slides in the order the spec sets: who we were, the awards, the banter,
 * then the reader's own season, then goodbye. An award nobody won is left out
 * rather than drawn empty.
 */
export const buildRecapSlides = (context: SlideContext): ReactNode[] =>
	[
		intro(context),
		numbers(context),
		context.club.podium.length > 0 && podium(context),
		remembered(context),
		...awardSlides(context),
		...banterSlides(context),
		...personalSlides(context),
		outro(context),
	].filter(Boolean);
