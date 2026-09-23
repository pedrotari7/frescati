'use client';

import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { AppUser, Game, Season } from '@shared/types';
import { feesFor, lateEntry, lateEntryNote } from '@shared/finances';
import { zonedCivilDate } from '@shared/datetime';
import { formatSek } from '@shared/format';
import Sheet from './Sheet';
import Button from './Button';
import DatePicker from './DatePicker';
import { Field } from './Field';
import { colors } from '../app/tokens.stylex';

const styles = stylex.create({
	blurb: { color: colors.muted, marginTop: 4, fontSize: 14, lineHeight: '20px' },
	field: { marginTop: 16 },
	sum: { color: colors.ink, marginTop: 12, fontSize: 14, lineHeight: '20px' },
	actions: { marginTop: 16, display: 'flex', gap: 12 },
});

/**
 * Adding somebody to a season that has already had a game.
 *
 * Asks for the day they start and charges the entry fee for the games from
 * there to the end, worked out by `lateEntry` and shown before anything is
 * written, because the number is the point of the sheet. The date starts on
 * today in the season's own timezone, which is the usual answer.
 */
const LateJoinSheet = ({
	user,
	season,
	games,
	onClose,
	onAdd,
}: {
	user: AppUser | null;
	season: Season;
	games: Game[];
	onClose: () => void;
	onAdd: (user: AppUser, entry: { amount: number; note: string }) => Promise<void>;
}) => {
	const [startDate, setStartDate] = useState('');
	const [saving, setSaving] = useState(false);
	const timezone = season.slot.timezone;

	useEffect(() => {
		if (user) setStartDate(zonedCivilDate(new Date().toISOString(), timezone));
	}, [user, timezone]);

	const entry = lateEntry(feesFor(season), season.memberUids.length + 1, games, startDate, timezone);

	const add = async () => {
		if (!user || !startDate) return;

		setSaving(true);
		await onAdd(user, { amount: entry.amount, note: lateEntryNote(entry, startDate) });
		setSaving(false);
		onClose();
	};

	return (
		<Sheet open={!!user} onClose={onClose} title={<>Add {user?.displayName}</>}>
			<p {...stylex.props(styles.blurb)}>
				The season has started, so they pay for the games from the day they start.
			</p>

			<div {...stylex.props(styles.field)}>
				<Field label='Starts on'>
					<DatePicker value={startDate} onChange={setStartDate} />
				</Field>
			</div>

			<p {...stylex.props(styles.sum)}>
				{entry.amount > 0
					? `${entry.remaining} of ${entry.games} games left, so ${formatSek(entry.amount)} of the ${formatSek(entry.share)} share.`
					: 'No games left from that day, so there is nothing to charge.'}
			</p>

			<div {...stylex.props(styles.actions)}>
				<Button variant='primary' fullWidth disabled={!startDate || saving} onClick={() => void add()}>
					{entry.amount > 0 ? `Add and charge ${formatSek(entry.amount)}` : 'Add'}
				</Button>
				<Button variant='ghost' fullWidth onClick={onClose}>
					Cancel
				</Button>
			</div>
		</Sheet>
	);
};

export default LateJoinSheet;
