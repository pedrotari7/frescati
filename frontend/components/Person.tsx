'use client';

import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import type { StyleXStyles } from '@stylexjs/stylex';
import type { AppUser } from '@shared/types';
import Avatar from './Avatar';
import { colors } from '../app/tokens.stylex';
import { utils } from '../lib/styles';

const styles = stylex.create({
	body: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	name: { color: colors.ink, fontSize: 14, lineHeight: '20px' },
});

/**
 * Who a row is about: the photo, the name, and whatever the screen says under
 * it.
 *
 * Six rows across the three admin screens drew this identically, down to the
 * truncation on the name. What they do with a person differs, one links to a
 * profile and the others carry two buttons, so the row element stays with the
 * screen. This is a fragment for exactly that reason: the avatar and the body
 * are siblings in the caller's flex row, not a box of their own.
 *
 * `children` go under the name, which is where a pill or a second line of
 * detail belongs. `sx` styles the body, for the one screen that needs it wider:
 * a squad row carries two buttons and has to wrap them onto their own line
 * rather than squeeze the name into a column one word across.
 */
const Person = ({
	person,
	sx,
	children,
}: {
	person: Pick<AppUser, 'displayName' | 'photoURL'>;
	sx?: StyleXStyles;
	children?: ReactNode;
}) => (
	<>
		<Avatar displayName={person.displayName} photoURL={person.photoURL} />

		<div {...stylex.props(styles.body, sx)}>
			<p {...stylex.props(styles.name, utils.truncate)}>{person.displayName}</p>
			{children}
		</div>
	</>
);

export default Person;
