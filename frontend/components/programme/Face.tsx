import * as stylex from '@stylexjs/stylex';
import type { PersonRow } from '../../lib/people';
import Avatar from '../Avatar';

const styles = stylex.create({
	ring: (colour: string) => ({ boxShadow: `0 0 0 2px ${colour}` }),
});

/** A player's picture with a ring in whatever colour the line beside it is about. */
const Face = ({ person, ring, size = 'sm' }: { person: PersonRow; ring: string; size?: 'sm' | 'md' | 'xl' }) => (
	<Avatar displayName={person.displayName} photoURL={person.photoURL} size={size} sx={styles.ring(ring)} />
);

export default Face;
