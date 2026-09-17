'use client';

import { PlusIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import Button from './Button';
import { colors } from '../app/tokens.stylex';
import { surfaces } from '../lib/styles';

const styles = stylex.create({
	plus: { width: 16, height: 16 },
	form: { display: 'flex', flexDirection: 'column', gap: 16, borderRadius: 16, padding: 20 },
	title: { color: colors.ink, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	actions: { display: 'flex', gap: 12 },
});

/**
 * Adding something to a list: either the form, or the button that opens it.
 *
 * The season's books carry two of these, one under the expenses and one under
 * the receipts, and they were the same twenty lines twice. Closed it is a
 * single secondary button, so the list above it stays the thing on screen.
 * Open it is a glass card with the fields, a primary button and a Cancel.
 *
 * `label` does double duty as the heading and the closed button, on purpose:
 * they named the same action and had already been written twice each, which is
 * four chances to end up with a button that says one thing and a form that
 * says another.
 *
 * Whether it may be shown at all is the caller's question. Both lists ask it of
 * the same thing, whether this person can edit the books, and both have more
 * than this panel riding on the answer.
 */
const AddPanel = ({
	open,
	onOpen,
	onCancel,
	onSubmit,
	label,
	action,
	canSubmit,
	children,
}: {
	open: boolean;
	onOpen: () => void;
	onCancel: () => void;
	onSubmit: () => void;
	/** The heading when open, and the button when closed. */
	label: string;
	/** What the primary button says, which is the verb rather than the noun. */
	action: string;
	canSubmit: boolean;
	children: ReactNode;
}) => {
	if (!open)
		return (
			<Button variant='secondary' fullWidth onClick={onOpen}>
				<PlusIcon {...stylex.props(styles.plus)} aria-hidden='true' />
				{label}
			</Button>
		);

	return (
		<section {...stylex.props(surfaces.glass, styles.form)}>
			<h3 {...stylex.props(styles.title)}>{label}</h3>

			{children}

			<div {...stylex.props(styles.actions)}>
				<Button variant='primary' fullWidth onClick={onSubmit} disabled={!canSubmit}>
					{action}
				</Button>

				<Button variant='ghost' fullWidth onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</section>
	);
};

export default AddPanel;
