import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';

/**
 * Reading a component's styling back out of the DOM.
 *
 * StyleX compiles a style object into a set of atomic class names, one per
 * property, and a jsdom test has no stylesheet to resolve them against. So a
 * test cannot ask what colour something is, the way it could when the class was
 * called `text-in` and said so. What it can ask is whether two states are
 * painted differently, and whether the style a caller passed in beat the
 * component's own, and a class list answers both: one property, one class, so
 * two states that differ carry different classes, and a property set twice
 * leaves only the winner behind.
 *
 * `getAttribute` rather than `className`, which on an SVG element is an
 * `SVGAnimatedString` and not a string. Sorted, because which order the classes
 * come out in is StyleX's business, not the component's behaviour.
 */
export const stylesOf = (el: Element | null | undefined): string[] =>
	(el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).sort();

/** What a style object compiles to, to compare against what an element carries. */
export const stylesFor = (...sx: StyleXStyles[]): string[] =>
	(stylex.props(...sx).className ?? '').split(/\s+/).filter(Boolean).sort();
