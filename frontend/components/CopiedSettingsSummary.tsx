import * as stylex from '@stylexjs/stylex';
import type { Payee } from '@shared/types';
import type { CopiedSettings } from '@shared/seasonCopy';
import { formatSek } from '@shared/format';
import { text } from '../lib/styles';

/** Who a pot is paid to, by name. A typed number is never read out: it is nobody's name. */
const payeeName = (payee: Payee | undefined, names: Map<string, string>): string =>
	(payee?.uid && names.get(payee.uid)) || (payee?.uid ? 'an admin' : 'a custom number');

/** The settings a copied season carries along that the form does not show, in one line. */
const summarise = (settings: CopiedSettings, creatorUid: string, names: Map<string, string>): string => {
	const parts: string[] = [];

	if (settings.fees) {
		parts.push(`fees ${formatSek(settings.fees.total)}`, `${formatSek(settings.fees.perGame)} per extra game`);

		const { entry, extras } = settings.fees.payees ?? {};

		if (entry || extras)
			parts.push(`season fee to ${payeeName(entry, names)}, extras to ${payeeName(extras, names)}`);
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

const CopiedSettingsSummary = ({
	settings,
	creatorUid,
	names,
}: {
	settings: CopiedSettings | null;
	creatorUid: string;
	/** Display names by uid, for the admins a payee can be. */
	names: Map<string, string>;
}) => settings && <p {...stylex.props(text.note)}>{summarise(settings, creatorUid, names)}</p>;

export default CopiedSettingsSummary;
