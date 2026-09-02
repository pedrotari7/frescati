'use client';

import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { colors, tint } from '../app/tokens.stylex';

/**
 * Bibs, in team order. Four is the ceiling, so four is all there is.
 *
 * One table rather than a copy per screen: a team is recognised by matching
 * what the scoreboard shows against what the team sheet showed, so the two
 * drifting apart is the exact failure this is meant to prevent.
 */
const palette = stylex.create({
	aText: { color: colors.teamA },
	bText: { color: colors.teamB },
	cText: { color: colors.teamC },
	dText: { color: colors.teamD },

	/*
	 * Was `ring-1 ring-team-a/40` on a card that already has the glass border,
	 * so this is the line outside that one and it has to stay outside it. A
	 * shadow rather than a second border, for the reason Tailwind's ring is one:
	 * the card is already sized, and a border would move its contents by a pixel.
	 */
	aRing: { boxShadow: `0 0 0 1px ${tint.teamA40}` },
	bRing: { boxShadow: `0 0 0 1px ${tint.teamB40}` },
	cRing: { boxShadow: `0 0 0 1px ${tint.teamC40}` },
	dRing: { boxShadow: `0 0 0 1px ${tint.teamD40}` },

	aFill: { backgroundColor: colors.teamA },
	bFill: { backgroundColor: colors.teamB },
	cFill: { backgroundColor: colors.teamC },
	dFill: { backgroundColor: colors.teamD },

	aChip: { backgroundColor: tint.teamA15, color: colors.teamA },
	bChip: { backgroundColor: tint.teamB15, color: colors.teamB },
	cChip: { backgroundColor: tint.teamC15, color: colors.teamC },
	dChip: { backgroundColor: tint.teamD15, color: colors.teamD },
});

/**
 * A bib's faces, and the raw colour behind them.
 *
 * `colour` is the token itself rather than a style, because the one thing a
 * style object cannot do is be combined with another into a single value: the
 * scoreboard washes its card from one team's colour to the other's, which is
 * one `linear-gradient`, not two backgrounds. `MatchScore` builds that from
 * these two strings. Under Tailwind it was `from-team-a/12` and `to-team-b/12`,
 * two classes that happened to compose because both set a gradient stop.
 */
const TEAM_STYLES = [
	{
		name: 'A',
		colour: colors.teamA,
		text: palette.aText,
		ring: palette.aRing,
		bar: palette.aFill,
		fill: palette.aFill,
		chip: palette.aChip,
	},
	{
		name: 'B',
		colour: colors.teamB,
		text: palette.bText,
		ring: palette.bRing,
		bar: palette.bFill,
		fill: palette.bFill,
		chip: palette.bChip,
	},
	{
		name: 'C',
		colour: colors.teamC,
		text: palette.cText,
		ring: palette.cRing,
		bar: palette.cFill,
		fill: palette.cFill,
		chip: palette.cChip,
	},
	{
		name: 'D',
		colour: colors.teamD,
		text: palette.dText,
		ring: palette.dRing,
		bar: palette.dFill,
		fill: palette.dFill,
		chip: palette.dChip,
	},
];

export const teamName = (index: number): string => TEAM_STYLES[index]?.name ?? `${index + 1}`;

/** Falls back to the first bib rather than to nothing. `MAX_TEAMS` is 4, so this is unreachable. */
export const teamStyle = (index: number) => TEAM_STYLES[index] ?? TEAM_STYLES[0];

const styles = stylex.create({
	badge: {
		color: colors.canvas,
		display: 'inline-flex',
		flexShrink: 0,
		alignItems: 'center',
		justifyContent: 'center',
		fontWeight: 900,
	},
	sm: { width: 28, height: 28, borderRadius: 8, fontSize: 14, lineHeight: '20px' },
	md: { width: 36, height: 36, borderRadius: 12, fontSize: 18, lineHeight: '28px' },
});

const SIZES = { sm: styles.sm, md: styles.md };

/**
 * A team's identity, as one solid block of its colour.
 *
 * Filled rather than tinted text on purpose. The scoreboard is filled in at
 * the side of a pitch, by whoever has a free hand, against a team sheet on a
 * different screen. A 14px coloured letter is not enough to tell two sides
 * apart at a glance, and putting the goals on the wrong side is the mistake
 * that costs a rating. So the same block appears on the team sheet, on the
 * fixture and in the table, and it is the loudest thing in each of them.
 */
const TeamBadge = ({ index, size = 'sm', sx }: { index: number; size?: keyof typeof SIZES; sx?: StyleXStyles }) => (
	<span {...stylex.props(styles.badge, SIZES[size], teamStyle(index).fill, sx)}>{teamName(index)}</span>
);

export default TeamBadge;
