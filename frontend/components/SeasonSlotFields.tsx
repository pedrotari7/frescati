'use client';

import * as stylex from '@stylexjs/stylex';
import type { Weekday } from '@shared/types';
import { weekdayName } from '@shared/format';
import DatePicker from './DatePicker';
import { Field, Select, TextInput } from './Field';

const styles = stylex.create({
	pair: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
});

/**
 * Where and when a season repeats: the venue, the weekday and kick-off, and the
 * dates it runs between.
 *
 * Both screens that edit a season carry these six fields in this order, and
 * carried them as two copies of forty-six lines.
 *
 * It stops before the pitch length and the minimum headcount, which look like
 * they belong here and do not: the admin screen labels them "Slot" and
 * "Minimum" and hints at what each one does, because it is editing a season
 * somebody already plays in, while the new-season screen says "Minutes" and
 * "Minimum players" to somebody who has not seen either word yet. Pulling them
 * in would have quietly reworded one of the two screens.
 *
 * The two date labels differ for the same reason, "Season starts" against
 * "Starts", so they are props with no default. A default here is an invitation
 * to add a third caller that never thinks about its wording.
 */
interface SeasonSlotForm {
	venueName: string;
	venueAddress: string;
	weekday: Weekday;
	time: string;
	startDate: string;
	endDate: string;
}

const SeasonSlotFields = <T extends SeasonSlotForm>({
	form,
	setForm,
	startLabel,
	endLabel,
}: {
	form: T;
	setForm: (next: T) => void;
	startLabel: string;
	endLabel: string;
}) => (
	<>
		<Field label='Venue'>
			<TextInput value={form.venueName} onChange={e => setForm({ ...form, venueName: e.target.value })} />
		</Field>

		<Field label='Address' hint='Optional, shown on the game screen.'>
			<TextInput value={form.venueAddress} onChange={e => setForm({ ...form, venueAddress: e.target.value })} />
		</Field>

		<div {...stylex.props(styles.pair)}>
			<Field label='Day'>
				<Select
					value={form.weekday}
					onChange={e => setForm({ ...form, weekday: Number(e.target.value) as Weekday })}
				>
					{[1, 2, 3, 4, 5, 6, 0].map(day => (
						<option key={day} value={day}>
							{weekdayName(day)}
						</option>
					))}
				</Select>
			</Field>

			<Field label='Kick-off'>
				<TextInput type='time' value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
			</Field>
		</div>

		<div {...stylex.props(styles.pair)}>
			<Field label={startLabel}>
				<DatePicker value={form.startDate} onChange={startDate => setForm({ ...form, startDate })} />
			</Field>

			<Field label={endLabel}>
				<DatePicker value={form.endDate} onChange={endDate => setForm({ ...form, endDate })} />
			</Field>
		</div>
	</>
);

export default SeasonSlotFields;
