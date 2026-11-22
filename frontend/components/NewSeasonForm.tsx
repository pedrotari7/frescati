'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import type { Season, Weekday } from '@shared/types';
import { parseCount } from '@shared/game';
import { copySeasonSettings, nextSeasonDates } from '@shared/seasonCopy';
import type { CopiedSettings } from '@shared/seasonCopy';
import { captureError } from '../lib/sentry';
import { createSeason } from '../lib/db/seasons';
import { colors } from '../app/tokens.stylex';
import { surfaces } from '../lib/styles';
import Button from './Button';
import CopiedSettingsSummary from './CopiedSettingsSummary';
import DatePicker from './DatePicker';
import { Field, Select, TextInput } from './Field';
import SeasonSlotFields from './SeasonSlotFields';
import Toggle from './Toggle';

const styles = stylex.create({
	page: { padding: 16 },
	form: { display: 'flex', flexDirection: 'column', gap: 16, borderRadius: 16, padding: 20 },

	/*
	 * Two across at every width, including the narrowest phone.
	 *
	 * These are the pairs that are read as one question, and stacking them puts
	 * the two halves of it on either side of a scroll. The labels are short and
	 * the controls are a date and a two-digit number, so the pair fits 320px.
	 */
	pair: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 },

	error: { color: colors.out, fontSize: 14, lineHeight: '20px' },
	note: { color: colors.faint, fontSize: 12, lineHeight: '16px' },
});

/** The group plays in Stockholm; a per-season picker can come later if needed. */
const TIMEZONE = 'Europe/Stockholm';

/** The value of the "Start blank" option. A season id is never empty. */
const BLANK = '';

const BLANK_SETTINGS = (uid: string): CopiedSettings => ({
	venue: { name: '', address: '' },
	slot: { weekday: 6, time: '15:00', durationMinutes: 90, timezone: TIMEZONE },
	minPlayers: 10,
	responseDeadlineHours: 24,
	reminderHours: [72, 24],
	adminUids: [uid],
});

/**
 * What the form shows for a source. The name is always empty, because a season
 * is named for what it is, not for what it came after.
 */
const fieldsFor = (source: Season | undefined) => {
	const dates = source ? nextSeasonDates(source) : { startDate: '', endDate: '' };

	return {
		name: '',
		venueName: source?.venue.name ?? 'Frescatihallen',
		venueAddress: source ? (source.venue.address ?? '') : 'Svante Arrhenius väg 4, 114 18 Stockholm',
		weekday: (source?.slot.weekday ?? 6) as Weekday,
		time: source?.slot.time ?? '15:00',
		// Held as typed rather than as numbers. `Number('')` is `0`, so coercing
		// on each keystroke turned backspacing the field to empty into a literal
		// zero the next digit landed beside, and a season saved with
		// `minPlayers: 0` is one no game can ever be at risk in.
		durationMinutes: String(source?.slot.durationMinutes ?? 90),
		minPlayers: String(source?.minPlayers ?? 10),
		...dates,
	};
};

/**
 * The form for a season that follows another. `sources` is the seasons the
 * signed-in user may copy, newest first, and `blankAllowed` is whether they may
 * start from nothing. The caller has already settled both, the rules enforce
 * them again.
 */
const NewSeasonForm = ({
	sources,
	preferredId,
	blankAllowed,
	uid,
}: {
	sources: Season[];
	preferredId: string | null;
	blankAllowed: boolean;
	uid: string;
}) => {
	const router = useRouter();

	const startId = sources.find(season => season.id === preferredId)?.id ?? sources[0]?.id ?? BLANK;
	const [sourceId, setSourceId] = useState(startId);
	const source = sources.find(season => season.id === sourceId);

	const [form, setForm] = useState(() => fieldsFor(source));
	const [signupClosesOn, setSignupClosesOn] = useState('');
	const [quiet, setQuiet] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const pickSource = (id: string) => {
		setSourceId(id);
		setForm(fieldsFor(sources.find(season => season.id === id)));
	};

	const durationMinutes = parseCount(form.durationMinutes);
	const minPlayers = parseCount(form.minPlayers);

	const isValid =
		form.name.trim() && form.venueName.trim() && form.startDate && form.endDate && durationMinutes && minPlayers;

	const handleCreate = async () => {
		setError(null);

		if (form.endDate < form.startDate) {
			setError('The end date is before the start date.');
			return;
		}

		// Narrowing for TypeScript as much as guarding: `isValid` already keeps
		// the button disabled without these, so this cannot be reached.
		if (!durationMinutes || !minPlayers) return;

		const copied = source ? copySeasonSettings(source, uid) : BLANK_SETTINGS(uid);

		try {
			const seasonId = await createSeason({
				...copied,
				name: form.name.trim(),
				status: 'draft',
				startDate: form.startDate,
				endDate: form.endDate,
				venue: {
					name: form.venueName.trim(),
					...(form.venueAddress.trim() ? { address: form.venueAddress.trim() } : {}),
				},
				slot: { ...copied.slot, weekday: form.weekday, time: form.time, durationMinutes },
				minPlayers,
				// The squad is whoever says yes, so nobody is a member until it is confirmed.
				memberUids: [],
				...(signupClosesOn ? { signupClosesOn } : {}),
				...(quiet ? { quiet: true } : {}),
				createdAt: new Date().toISOString(),
				createdBy: uid,
			});

			router.replace(`/s/${seasonId}/admin`);
		} catch (createError) {
			console.error('Could not create season', createError);
			setError('Could not create the season. Check you still have admin rights.');
			void captureError(createError, { stage: 'createSeason' });
		}
	};

	return (
		<div {...stylex.props(styles.page)}>
			<section {...stylex.props(surfaces.glass, styles.form)}>
				<Field label='Copy from'>
					<Select value={sourceId} onChange={e => pickSource(e.target.value)}>
						{sources.map(season => (
							<option key={season.id} value={season.id}>
								{season.name}
							</option>
						))}
						{blankAllowed && <option value={BLANK}>Start blank</option>}
					</Select>
				</Field>

				<Field label='Name' hint="Something you'll recognise, e.g. 'Autumn 2026'.">
					<TextInput
						value={form.name}
						onChange={e => setForm({ ...form, name: e.target.value })}
						placeholder='Autumn 2026'
					/>
				</Field>

				<SeasonSlotFields form={form} setForm={setForm} startLabel='Starts' endLabel='Ends' />

				<div {...stylex.props(styles.pair)}>
					<Field label='Minutes'>
						<TextInput
							type='number'
							inputMode='numeric'
							min={1}
							value={form.durationMinutes}
							onChange={e => setForm({ ...form, durationMinutes: e.target.value })}
						/>
					</Field>

					<Field label='Minimum players'>
						<TextInput
							type='number'
							inputMode='numeric'
							min={1}
							value={form.minPlayers}
							onChange={e => setForm({ ...form, minPlayers: e.target.value })}
						/>
					</Field>
				</div>

				<Field label='Sign-up closes' hint='Optional. Reminders stop after this day.'>
					<DatePicker value={signupClosesOn} onChange={setSignupClosesOn} placeholder='No closing date' />
				</Field>

				{signupClosesOn && (
					<Button variant='secondary' fullWidth onClick={() => setSignupClosesOn('')}>
						Remove closing date
					</Button>
				)}

				<Toggle
					label="Don't notify anyone"
					description='Set the season up quietly. Nobody is asked to sign up until you turn this off.'
					checked={quiet}
					onChange={setQuiet}
				/>

				<CopiedSettingsSummary settings={source ? copySeasonSettings(source, uid) : null} creatorUid={uid} />

				{error && <p {...stylex.props(styles.error)}>{error}</p>}

				<Button variant='primary' fullWidth disabled={!isValid} onClick={handleCreate}>
					Create season
				</Button>

				<p {...stylex.props(styles.note)}>
					The season opens for sign-up. Everybody who says yes becomes the squad when you confirm it.
				</p>
			</section>
		</div>
	);
};

export default NewSeasonForm;
