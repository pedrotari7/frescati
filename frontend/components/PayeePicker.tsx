import * as stylex from '@stylexjs/stylex';
import type { PayeeOption } from '@shared/types';
import type { PayeeChoice } from '../lib/seasonForm';
import { Field, Select, TextInput } from './Field';

const CUSTOM = '__custom';

const styles = stylex.create({
	picker: { display: 'flex', flexDirection: 'column', gap: 12 },
});

/**
 * Who one fee is paid to: a listed admin by name, or a number typed in.
 *
 * `options` is null while the admins load, and the control is disabled then
 * rather than showing a list that is about to change. `failed` leaves the custom
 * number usable, which is the way out when the list cannot be had. An admin the
 * list no longer holds stays selectable as what the season says, so opening the
 * form never quietly changes who is paid.
 */
const PayeePicker = ({
	label,
	choice,
	onChange,
	options,
	failed = false,
}: {
	label: string;
	choice: PayeeChoice;
	onChange: (choice: PayeeChoice) => void;
	options: PayeeOption[] | null;
	failed?: boolean;
}) => {
	const listed = options ?? [];
	const unlisted = choice.kind === 'admin' && !listed.some(option => option.uid === choice.uid);

	return (
		<div {...stylex.props(styles.picker)}>
			<Field label={label} hint={failed ? "Couldn't load the admins. A custom number still works." : undefined}>
				<Select
					value={choice.kind === 'admin' ? choice.uid : CUSTOM}
					disabled={options === null && !failed}
					onChange={e =>
						onChange(
							e.target.value === CUSTOM
								? { kind: 'custom', swish: '' }
								: { kind: 'admin', uid: e.target.value }
						)
					}
				>
					{listed.map(option => (
						<option key={option.uid} value={option.uid}>
							{option.displayName}
							{option.hasNumber ? '' : ' (no number saved)'}
						</option>
					))}
					{unlisted && <option value={choice.uid}>Current payee</option>}
					<option value={CUSTOM}>Custom number</option>
				</Select>
			</Field>

			{choice.kind === 'custom' && (
				<Field label='Swish number'>
					<TextInput
						value={choice.swish}
						onChange={e => onChange({ kind: 'custom', swish: e.target.value })}
						placeholder='0701234567'
						inputMode='tel'
						maxLength={20}
					/>
				</Field>
			)}
		</div>
	);
};

export default PayeePicker;
