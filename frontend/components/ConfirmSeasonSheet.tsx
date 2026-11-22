'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { AppUser, Season } from '@shared/types';
import { counted, formatSek } from '@shared/format';
import { signupShare } from '@shared/signup';
import { confirmSeason } from '../lib/db/signups';
import { nameByUid } from '../lib/people';
import { useWrite } from '../hooks/useWrite';
import { colors } from '../app/tokens.stylex';
import Button from './Button';
import Sheet from './Sheet';
import { useToast } from './Toast';

const styles = stylex.create({
	body: { color: colors.muted, marginTop: 8, fontSize: 14, lineHeight: 1.625 },
	warning: { color: colors.pending, marginTop: 12, fontSize: 14, lineHeight: 1.625 },
	actions: { marginTop: 20, display: 'flex', gap: 12 },
});

/**
 * The last look before a season stops signing up and starts.
 *
 * It repeats what the admin is about to commit to: how many are in, what each
 * owes, and which admins lose the role because they never said yes. That last
 * one is the surprise, and the reason this is a sheet rather than a bare button.
 * The server decides all of it again when it runs, so the numbers here are the
 * admin's preview, not an input.
 */
const ConfirmSeasonSheet = ({
	open,
	onClose,
	season,
	yesUids,
	usersByUid,
}: {
	open: boolean;
	onClose: () => void;
	season: Season;
	yesUids: string[];
	usersByUid: Map<string, AppUser>;
}) => {
	const write = useWrite();
	const { notify } = useToast();
	const [busy, setBusy] = useState(false);

	const share = signupShare(season, yesUids.length);
	const demoted = season.adminUids.filter(uid => !yesUids.includes(uid));

	const handleConfirm = async () => {
		setBusy(true);

		let result: Awaited<ReturnType<typeof confirmSeason>> | null = null;

		const ok = await write(async () => {
			result = await confirmSeason(season.id);
		}, "Couldn't confirm the season.");

		setBusy(false);

		if (!ok || !result) return;

		const { members, share: owed } = result;

		notify(
			`${season.name} is on with ${counted(members, 'member')}.${owed > 0 ? ` Each owes ${formatSek(owed)}.` : ''}`
		);
		onClose();
	};

	return (
		<Sheet open={open} onClose={onClose} title={<>Confirm {season.name}?</>}>
			<p {...stylex.props(styles.body)}>
				{counted(yesUids.length, 'player')} will make up the squad.
				{share > 0 && ` Each owes ${formatSek(share)}.`} Anybody who has not answered stays out. The season
				starts once you confirm.
			</p>

			{demoted.length > 0 && (
				<p {...stylex.props(styles.warning)}>
					These admins did not say yes, so they stop being admins of this season:{' '}
					{demoted.map(uid => nameByUid(usersByUid, uid)).join(', ')}.
				</p>
			)}

			<div {...stylex.props(styles.actions)}>
				<Button variant='ghost' fullWidth onClick={onClose}>
					Cancel
				</Button>
				<Button variant='primary' fullWidth disabled={busy} onClick={handleConfirm}>
					Confirm season
				</Button>
			</div>
		</Sheet>
	);
};

export default ConfirmSeasonSheet;
