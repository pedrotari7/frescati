'use client';

import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import Button from './Button';
import { SectionHeading } from './Section';

const styles = stylex.create({
	head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 4 },
});

/**
 * The games already played, behind a Show button.
 *
 * Both screens that list a season's calendar carry it, and for the same reason:
 * by March this is twenty rows of football that has already happened, and
 * neither screen was opened to read it. The season home page was opened to
 * answer the next game, the admin calendar to change one that hasn't happened.
 * Closed it costs a heading and a count, which is about what the last result is
 * worth to either of them.
 *
 * Nothing at all when there is nothing played, rather than an empty card: a
 * heading with a Show button that reveals nothing is worse than no heading.
 *
 * The rows belong to the caller, which is the whole point of the split. The
 * home page draws answerable `GameRow`s in a stack and the admin screen draws
 * `CalendarRow`s in a card, and those are genuinely different lists of the same
 * games. `sx` is the gap under the heading, which differs because what sits
 * under it does.
 */
const PlayedSection = ({
	count,
	open,
	onToggle,
	sx,
	children,
}: {
	count: number;
	open: boolean;
	onToggle: () => void;
	sx?: StyleXStyles;
	children: ReactNode;
}) => {
	if (count === 0) return null;

	return (
		<section>
			<div {...stylex.props(styles.head, sx)}>
				<SectionHeading>Played ({count})</SectionHeading>

				<Button variant='ghost' size='sm' onClick={onToggle}>
					{open ? 'Hide' : 'Show'}
				</Button>
			</div>

			{open && children}
		</section>
	);
};

export default PlayedSection;
