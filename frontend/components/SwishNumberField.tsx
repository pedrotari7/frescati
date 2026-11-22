'use client';

import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useMyPayment } from '../hooks/useData';
import { useWrite } from '../hooks/useWrite';
import { clearMyPayment, saveMyPayment } from '../lib/db/payment';
import { surfaces } from '../lib/styles';
import { colors } from '../app/tokens.stylex';
import Button from './Button';
import { Field, TextInput } from './Field';

const styles = stylex.create({
	card: { borderRadius: 16, padding: 20 },
	title: { color: colors.ink, marginBottom: 4, fontSize: 16, lineHeight: '24px', fontWeight: 600 },
	blurb: { color: colors.muted, marginBottom: 12, fontSize: 14, lineHeight: 1.625 },
	save: { marginTop: 12 },
});

/**
 * An admin's own Swish number, which seasons that pay to them show to whoever
 * owes money.
 *
 * Saving an empty field clears the number rather than writing a blank one:
 * "no number" is the absence of the document, which is what the backend
 * sync and the picker both test.
 */
const SwishNumberField = ({ uid }: { uid: string }) => {
	const saved = useMyPayment(uid);
	const write = useWrite();
	const [value, setValue] = useState('');

	useEffect(() => setValue(saved ?? ''), [saved]);

	const trimmed = value.trim();
	const changed = trimmed !== (saved ?? '');

	const save = async () => {
		if (!changed) return;

		await write(
			() => (trimmed ? saveMyPayment(uid, trimmed) : clearMyPayment(uid)),
			"Couldn't save your Swish number."
		);
	};

	return (
		<section {...stylex.props(surfaces.glass, styles.card)}>
			<h2 {...stylex.props(styles.title)}>Your Swish number</h2>

			<p {...stylex.props(styles.blurb)}>
				Only shown to people paying a season that sends money to you. Admins pick a payee by name and never see
				the number.
			</p>

			<form
				onSubmit={event => {
					event.preventDefault();
					void save();
				}}
			>
				<Field label='Number'>
					<TextInput
						type='tel'
						inputMode='tel'
						maxLength={20}
						placeholder='0701234567'
						value={value}
						onChange={event => setValue(event.target.value)}
					/>
				</Field>

				<Button type='submit' variant='secondary' fullWidth sx={styles.save} disabled={!changed}>
					{saved && !trimmed ? 'Clear number' : 'Save'}
				</Button>
			</form>
		</section>
	);
};

export default SwishNumberField;
