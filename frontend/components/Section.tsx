import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { colors, tint } from '../app/tokens.stylex';
import { surfaces, text } from '../lib/styles';

/**
 * The three pieces almost every list in this app is built from.
 *
 * A heading, a glass card, and the line the card shows when it is empty. The
 * class strings were hand-typed twenty, eleven and ten times respectively, so
 * changing the type scale or the divider colour meant a find-and-replace across
 * a dozen files and hoping none of them had drifted a space.
 *
 * Kept as three primitives rather than one `<ListSection title count empty>`
 * deliberately. Eight call sites would fit that exactly and four would not:
 * the kit register's headings are kind labels with no count, the games calendar
 * has no count either, and the books draw their card from a component with the
 * heading left to the screen around it. A component that eight of twelve callers
 * can use is one the other four route around, and then there are two ways to
 * build a list again.
 */

const styles = stylex.create({
	card: { borderRadius: 16, paddingInline: 16 },

	/*
	 * The line between two rows, drawn on the lower of the two.
	 *
	 * This was `divide-y` on the card, which is a rule about the gaps between
	 * somebody else's children. StyleX only ever styles the element the class is
	 * on, so the rule has to move down onto the rows, and every row that wants a
	 * divider now says so. The `:first-child` reset is what keeps the top of the
	 * card clean, and it is the reason this cannot simply be a border: a border
	 * on every row would draw one against the card's own rounding.
	 *
	 * The cost is real and worth naming: a caller that forgets it gets a list
	 * with no dividers rather than an error. The upside is that the rows that
	 * genuinely should not have one, a header row, a footer total, no longer
	 * have to fight the card to avoid it.
	 */
	row: {
		borderTopWidth: { default: 1, ':first-child': 0 },
		borderTopStyle: 'solid',
		borderTopColor: tint.white5,
	},

	empty: { color: colors.faint, paddingBlock: 16, fontSize: 14, lineHeight: '20px' },
});

/**
 * A small-caps section label.
 *
 * Carries the type and the colour but no spacing, because the spacing genuinely
 * differs: the season home page wants 12px between a heading and a stack of
 * game cards, everything else wants 8px, and the Played section puts the
 * heading in a flex row with a button and wants no margin at all. Baking one in
 * would mean three callers overriding it, which StyleX would at least settle
 * properly, the later style wins, where the concatenated class strings this
 * replaced left `mb-2 mb-3` on the element and CSS source order to decide.
 */
export const SectionHeading = ({ children, sx }: { children: ReactNode; sx?: StyleXStyles }) => (
	<h2 {...stylex.props(text.sectionHeading, sx)}>{children}</h2>
);

/** The divider a `ListCard` row wears. See `styles.row` for why it lives out here. */
export const listRow = styles.row;

/**
 * The card a list of rows sits in.
 *
 * The rows draw the lines between themselves, with `listRow`, so that the first
 * and last have no stray edge against the card's own rounding.
 */
export const ListCard = ({ children, sx }: { children: ReactNode; sx?: StyleXStyles }) => (
	<div {...stylex.props(surfaces.glass, styles.card, sx)}>{children}</div>
);

/**
 * What a `ListCard` says when there is nothing in it.
 *
 * Inside the card rather than replacing it, so an empty section keeps its shape
 * on the page instead of collapsing, a heading with a card under it reads as
 * "nothing here yet", where a heading with nothing under it reads as broken.
 */
export const ListEmpty = ({ children }: { children: ReactNode }) => <p {...stylex.props(styles.empty)}>{children}</p>;
