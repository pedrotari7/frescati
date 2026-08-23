import type { ReactNode } from 'react';
import { classNames } from '../lib/utils/reactHelper';

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
 * has no count either, and the squad screen has a card with no heading above it
 * at all. A component that eight of twelve callers can use is one the other
 * four route around, and then there are two ways to build a list again.
 */

/**
 * A small-caps section label.
 *
 * Carries the type and the colour but no spacing, because the spacing genuinely
 * differs: the season home page wants `mb-3` between a heading and a stack of
 * game cards, everything else wants `mb-2`, and the Played section puts the
 * heading in a flex row with a button and wants no margin at all. Baking one in
 * would mean three callers overriding it, and `classNames` concatenates rather
 * than merging, so `mb-2 mb-3` would leave the winner to CSS source order.
 */
export const SectionHeading = ({ children, className }: { children: ReactNode; className?: string }) => (
	<h2 className={classNames('text-faint text-xs font-semibold tracking-wider uppercase', className)}>{children}</h2>
);

/**
 * The card a list of rows sits in.
 *
 * `divide-y` rather than a border per row, so the first and last rows have no
 * stray edge against the card's own rounding, which is why rows inside it
 * carry only vertical padding and never a border of their own.
 */
export const ListCard = ({ children, className }: { children: ReactNode; className?: string }) => (
	<div className={classNames('glass divide-y divide-white/5 rounded-2xl px-4', className)}>{children}</div>
);

/**
 * What a `ListCard` says when there is nothing in it.
 *
 * Inside the card rather than replacing it, so an empty section keeps its shape
 * on the page instead of collapsing, a heading with a card under it reads as
 * "nothing here yet", where a heading with nothing under it reads as broken.
 */
export const ListEmpty = ({ children }: { children: ReactNode }) => (
	<p className='text-faint py-4 text-sm'>{children}</p>
);
