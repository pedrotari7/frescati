'use client';

import { classNames } from '../lib/utils/reactHelper';

/**
 * Bibs, in team order. Four is the ceiling, so four is all there is.
 *
 * One table rather than a copy per screen: a team is recognised by matching
 * what the scoreboard shows against what the team sheet showed, so the two
 * drifting apart is the exact failure this is meant to prevent.
 */
const TEAM_STYLES = [
	{
		name: 'A',
		text: 'text-team-a',
		ring: 'ring-team-a/40',
		bar: 'bg-team-a',
		fill: 'bg-team-a',
		chip: 'bg-team-a/15 text-team-a',
		washFrom: 'from-team-a/12',
		washTo: 'to-team-a/12',
	},
	{
		name: 'B',
		text: 'text-team-b',
		ring: 'ring-team-b/40',
		bar: 'bg-team-b',
		fill: 'bg-team-b',
		chip: 'bg-team-b/15 text-team-b',
		washFrom: 'from-team-b/12',
		washTo: 'to-team-b/12',
	},
	{
		name: 'C',
		text: 'text-team-c',
		ring: 'ring-team-c/40',
		bar: 'bg-team-c',
		fill: 'bg-team-c',
		chip: 'bg-team-c/15 text-team-c',
		washFrom: 'from-team-c/12',
		washTo: 'to-team-c/12',
	},
	{
		name: 'D',
		text: 'text-team-d',
		ring: 'ring-team-d/40',
		bar: 'bg-team-d',
		fill: 'bg-team-d',
		chip: 'bg-team-d/15 text-team-d',
		washFrom: 'from-team-d/12',
		washTo: 'to-team-d/12',
	},
];

export const teamName = (index: number): string => TEAM_STYLES[index]?.name ?? `${index + 1}`;

/** Falls back to the first bib rather than to nothing. `MAX_TEAMS` is 4, so this is unreachable. */
export const teamStyle = (index: number) => TEAM_STYLES[index] ?? TEAM_STYLES[0];

const SIZES = {
	sm: 'size-7 rounded-lg text-sm',
	md: 'size-9 rounded-xl text-lg',
};

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
const TeamBadge = ({
	index,
	size = 'sm',
	className,
}: {
	index: number;
	size?: keyof typeof SIZES;
	className?: string;
}) => (
	<span
		className={classNames(
			'text-canvas inline-flex shrink-0 items-center justify-center font-black',
			SIZES[size],
			teamStyle(index).fill,
			className
		)}
	>
		{teamName(index)}
	</span>
);

export default TeamBadge;
