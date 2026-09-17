'use client';

import { TrashIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import Button from './Button';

const styles = stylex.create({
	icon: { width: 16, height: 16 },
});

/**
 * The bin at the end of a row.
 *
 * An icon with no words on it, so the label is the only thing that says what it
 * removes, and it is the only thing a screen reader gets. `what` is that
 * phrase: three rows in the season's books draw this button and each names a
 * different thing, an expense, a receipt, somebody's charge.
 *
 * Ghost rather than danger. Every one of these sits in a list beside other
 * per-row buttons, and a red one in each row paints the whole screen as a
 * warning. The confirmation is where the weight belongs.
 */
const RemoveButton = ({ what, onRemove }: { what: string; onRemove: () => void }) => (
	<Button size='sm' variant='ghost' aria-label={`Remove ${what}`} onClick={onRemove}>
		<TrashIcon {...stylex.props(styles.icon)} aria-hidden='true' />
	</Button>
);

export default RemoveButton;
