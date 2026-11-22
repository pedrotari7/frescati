import * as stylex from '@stylexjs/stylex';
import type { CopiedSettings } from '@shared/seasonCopy';
import { formatSek } from '@shared/format';
import { colors } from '../app/tokens.stylex';

const styles = stylex.create({
	note: { color: colors.faint, fontSize: 12, lineHeight: '16px' },
});

/** The settings a copied season carries along that the form does not show, in one line. */
const summarise = (settings: CopiedSettings, creatorUid: string): string => {
	const parts: string[] = [];

	if (settings.fees) {
		parts.push(`fees ${formatSek(settings.fees.total)}`, `${formatSek(settings.fees.perGame)} per extra game`);
	}

	parts.push(`deadline ${settings.responseDeadlineHours} h`);

	if (settings.reminderHours.length > 0) {
		parts.push(`reminders ${settings.reminderHours.join(' h and ')} h`);
	}

	if (settings.balance) parts.push('team balance');

	const others = settings.adminUids.filter(uid => uid !== creatorUid).length;

	if (others > 0) parts.push(`${others} other admin${others === 1 ? '' : 's'}`);

	return `Also copied: ${parts.join(', ')}`;
};

const CopiedSettingsSummary = ({ settings, creatorUid }: { settings: CopiedSettings | null; creatorUid: string }) =>
	settings && <p {...stylex.props(styles.note)}>{summarise(settings, creatorUid)}</p>;

export default CopiedSettingsSummary;
