'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import type { Award, AwardsRecap, BanterRecap, ClubRecap, MatchHighlight, PersonalRecap } from '@shared/recap';
import type { Season } from '@shared/types';
import { toDisplayMovement } from '@shared/leaderboard';
import { toDisplayRating } from '@shared/rating';
import { counted, formatGameDate, placeLabel, signed } from '@shared/format';
import { colors, tint } from '../../app/tokens.stylex';

const styles = stylex.create({
	eyebrow: {
		color: colors.brand,
		fontSize: 13,
		lineHeight: '16px',
		fontWeight: 700,
		letterSpacing: '0.08em',
		textTransform: 'uppercase',
	},
	title: { color: colors.ink, fontSize: 32, lineHeight: 1.1, fontWeight: 800, marginTop: 8 },
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
	/* The slide lets taps fall through to the story; a link has to catch its own. */
	link: { pointerEvents: 'auto' },
	rowLabel: { color: colors.muted, fontSize: 14 },
	rowValue: { color: colors.ink, fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
	spark: { width: '100%', height: 96, marginTop: 24, overflow: 'visible' },
	sparkLine: { fill: 'none', stroke: colors.brand, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' },
});

/** "Anna", "Anna and Bosse", "Anna, Bosse and Cia". */
const joinNames = (names: string[]): string =>
	names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

const prefersMotion = (): boolean =>
	typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches;

/** A number that counts up from zero when its slide opens, unless motion is turned down. */
const CountUp = ({ value, format = String }: { value: number; format?: (value: number) => string }) => {
	const [shown, setShown] = useState(() => (prefersMotion() ? 0 : value));

	useEffect(() => {
		if (!prefersMotion()) {
			setShown(value);
			return;
		}

		const started = performance.now();
		let frame = 0;
		const tick = (now: number) => {
			const progress = Math.min(1, (now - started) / 700);
			setShown(Math.round(value * (1 - (1 - progress) ** 3)));
			if (progress < 1) frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [value]);

	return <>{format(shown)}</>;
};

const Slide = ({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) => (
	<>
		<p {...stylex.props(styles.eyebrow)}>{eyebrow}</p>
		<h2 {...stylex.props(styles.title)}>{title}</h2>
		{children}
	</>
);

const Stat = ({ value, label, format }: { value: number; label: string; format?: (value: number) => string }) => (
	<div {...stylex.props(styles.stat)}>
		<p {...stylex.props(styles.statValue)}>
			<CountUp value={value} format={format} />
		</p>
		<p {...stylex.props(styles.statLabel)}>{label}</p>
	</div>
);

const Row = ({ label, value, href }: { label: string; value: string; href?: string }) => {
	const content = (
		<>
			<span {...stylex.props(styles.rowLabel)}>{label}</span>
			<span {...stylex.props(styles.rowValue)}>{value}</span>
		</>
	);

	return (
		<li>
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

/** The rating journey on the 0–100 scale every other screen shows. */
const Sparkline = ({ elos }: { elos: number[] }) => {
	const values = elos.map(toDisplayRating);
	const [low, high] = [Math.min(...values), Math.max(...values)];
	const span = Math.max(1, high - low);
	const step = 100 / Math.max(1, values.length - 1);
	const points = values.map((value, index) => `${index * step},${40 - ((value - low) / span) * 40}`).join(' ');

	return (
		<svg viewBox='0 0 100 40' preserveAspectRatio='none' aria-hidden='true' {...stylex.props(styles.spark)}>
			<polyline points={points} vectorEffect='non-scaling-stroke' {...stylex.props(styles.sparkLine)} />
		</svg>
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
	<Slide key='intro' eyebrow={season.name} title="That's a wrap">
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
			<Stat value={club.gamesPlayed} label='Games played' />
			<Stat value={club.totalGoals} label='Goals' />
			<Stat value={club.players} label='Players' />
			<Stat value={club.extras} label='Extras' />
			<Stat value={club.averageTurnout} label='Average turnout' />
		</div>
	</Slide>
);

const podium = ({ club, nameOf }: SlideContext) => (
	<Slide key='podium' eyebrow='The table' title='The podium'>
		<ul {...stylex.props(styles.list)}>
			{club.podium.map(row => (
				<Row
					key={row.uid}
					label={placeLabel(row.position)}
					value={`${nameOf(row.uid)}, ${counted(row.wins, 'win')}`}
				/>
			))}
		</ul>
	</Slide>
);

const remembered = ({ season, club }: SlideContext) => {
	const gameHref = (gameId: string) => `/s/${season.id}/g/${gameId}`;
	const date = (kickoff: string) => formatGameDate(kickoff, season.slot.timezone);
	const matches: [string, MatchHighlight | null][] = [
		['Most goals', club.highestScoring],
		['Biggest win', club.biggestWin],
		['Closest finish', club.closestFinish],
	];

	return (
		<Slide key='games' eyebrow='The games' title='Games to remember'>
			<ul {...stylex.props(styles.list)}>
				{matches.map(([label, highlight]) =>
					highlight ? (
						<Row
							key={label}
							label={`${label}, ${date(highlight.kickoff)}`}
							value={score(highlight)}
							href={gameHref(highlight.gameId)}
						/>
					) : null
				)}
				{club.bestTurnout && (
					<Row
						label={`Biggest turnout, ${date(club.bestTurnout.kickoff)}`}
						value={counted(club.bestTurnout.turnout, 'player')}
						href={gameHref(club.bestTurnout.gameId)}
					/>
				)}
			</ul>
		</Slide>
	);
};

const awardSlide = (
	key: string,
	eyebrow: string,
	award: Award | null,
	detail: (value: number) => string,
	nameOf: (uid: string) => string,
	extra?: ReactNode
) =>
	award && (
		<Slide key={key} eyebrow={eyebrow} title={joinNames(award.uids.map(nameOf))}>
			<p {...stylex.props(styles.body)}>{detail(award.value)}</p>
			{extra}
		</Slide>
	);

const awardSlides = ({ awards, nameOf }: SlideContext): ReactNode[] => [
	awardSlide(
		'motm',
		'Man of the match',
		awards.motm,
		value => `Voted best on the pitch ${counted(value, 'time')}.`,
		nameOf
	),
	awardSlide(
		'iron',
		'Iron man',
		awards.ironMan,
		value => `Turned up for ${counted(value, 'game')}.`,
		nameOf,
		awards.perfectAttendance.length > 0 && (
			<p {...stylex.props(styles.body)}>Never missed one: {joinNames(awards.perfectAttendance.map(nameOf))}.</p>
		)
	),
	awardSlide(
		'climber',
		'Biggest climber',
		awards.climber,
		value => `${signed(toDisplayMovement(value))} on the rating.`,
		nameOf
	),
	awardSlide('streak', 'Longest winning run', awards.streak, value => `${counted(value, 'win')} in a row.`, nameOf),
];

const banterSlides = ({ banter, nameOf }: SlideContext): ReactNode[] => [
	awardSlide(
		'noshows',
		'Most no-shows',
		banter.noShows,
		value => `Said they were in and didn't show, ${counted(value, 'time')}.`,
		nameOf
	),
	awardSlide(
		'lucy',
		'Last-minute Lucy',
		banter.lastMinute,
		value => `${counted(value, 'answer')} given or changed in the 24 hours before kickoff.`,
		nameOf
	),
	awardSlide(
		'spoon',
		'Wooden spoon',
		banter.woodenSpoon,
		value => `Bottom of the table on ${counted(value, 'win')}. There is always next season.`,
		nameOf
	),
];

const personalSlides = ({ season, personal, mine, nameOf }: SlideContext): ReactNode[] => {
	if (!personal) return [];

	const whose = mine ? 'Your season' : `${nameOf(personal.row.uid)}'s season`;
	const [start, end] = [personal.journey[0], personal.journey[personal.journey.length - 1]];

	return [
		<Slide key='line' eyebrow={whose} title={placeLabel(personal.row.position)}>
			<div {...stylex.props(styles.grid)}>
				<Stat value={personal.row.appearances} label='Games' />
				<Stat value={personal.row.wins} label='Wins' />
				<Stat value={Math.round(personal.winRate * 100)} label='Win rate' format={value => `${value}%`} />
				<Stat value={personal.motmVotes} label='Man-of-the-match votes' />
			</div>
		</Slide>,
		<Slide key='journey' eyebrow={whose} title={`${toDisplayRating(start)} to ${toDisplayRating(end)}`}>
			<Sparkline elos={personal.journey} />
		</Slide>,
		<Slide key='people' eyebrow={whose} title='The people'>
			<ul {...stylex.props(styles.list)}>
				{personal.bestTeammate && (
					<Row
						label='Won most with'
						value={`${nameOf(personal.bestTeammate.uid)}, ${personal.bestTeammate.wonTogether}`}
					/>
				)}
				{personal.nemesis && (
					<Row
						label='Nemesis'
						value={`${nameOf(personal.nemesis.uid)}, ${personal.nemesis.beat}–${personal.nemesis.lostTo}`}
					/>
				)}
				{personal.bestGame && (
					<Row
						label={`Best game, ${formatGameDate(personal.bestGame.kickoff, season.slot.timezone)}`}
						value={signed(toDisplayMovement(personal.bestGame.gain))}
						href={`/s/${season.id}/g/${personal.bestGame.gameId}`}
					/>
				)}
			</ul>
		</Slide>,
	];
};

const outro = ({ season }: SlideContext) => (
	<Slide key='outro' eyebrow={season.name} title='See you next season'>
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
