'use client';

import * as stylex from '@stylexjs/stylex';
import type { ResponseStatus } from '@shared/types';
import Sheet from './Sheet';
import Button from './Button';
import StatusPill from './StatusPill';
import { colors } from '../app/tokens.stylex';

/**
 * What a season admin can leave on somebody else's response.
 *
 * `null` is the absence of the document rather than a fourth status, which is
 * the same third state the whole app rests on: no response means nobody has
 * said anything, and putting somebody back into that state is a delete.
 */
export type AnswerChoice = ResponseStatus | null;

const OPTIONS: { answer: ResponseStatus; label: string }[] = [
	{ answer: 'in', label: "They're in" },
	{ answer: 'out', label: "They're out" },
];

const styles = stylex.create({
	blurb: { color: colors.muted, marginTop: 4, fontSize: 14, lineHeight: '20px' },
	list: { marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 },
	clear: { marginTop: 12 },
	cancel: { marginTop: 8 },
});

/**
 * Recording what somebody told you somewhere other than the app.
 *
 * A sheet rather than another button on the row, and the reason is the width of
 * a phone. The roster groups already end in controls of their own, the spot for
 * an extra and the nudge for somebody who has said nothing, and a second
 * labelled button beside either leaves the name truncated to nothing. One small
 * icon opens this instead, so the answers sit in the same place whichever group
 * the person is in.
 *
 * The one they already hold stays in the list, marked, rather than being
 * filtered out. `PlayerTeamSheet` keeps the squad somebody is already on for
 * the same reason: seeing where they stand is the context for moving them, and
 * a list that loses a row depending on the answer reads as a bug.
 *
 * Taking the answer away is last and set apart, because it is the one option
 * that is not an answer. It is offered only when there is one to take.
 */
const AnswerSheet = ({
	displayName,
	status,
	open,
	onClose,
	onPick,
}: {
	displayName: string;
	/** What their response says now, or nothing when they have not answered. */
	status: ResponseStatus | undefined;
	open: boolean;
	onClose: () => void;
	onPick: (answer: AnswerChoice) => Promise<void>;
}) => (
	<Sheet open={open} onClose={onClose} title={<>Answer for {displayName}</>}>
		<p {...stylex.props(styles.blurb)}>
			Whatever they told you, recorded in their name. The headcount moves with it.
		</p>

		<div {...stylex.props(styles.list)}>
			{OPTIONS.map(option => {
				const current = status === option.answer;

				return (
					<Button key={option.answer} fullWidth disabled={current} onClick={() => onPick(option.answer)}>
						{option.label}
						{current && <StatusPill tone='neutral'>Now</StatusPill>}
					</Button>
				);
			})}
		</div>

		{status && (
			<Button variant='danger' fullWidth sx={styles.clear} onClick={() => onPick(null)}>
				Back to no answer
			</Button>
		)}

		<Button variant='ghost' fullWidth sx={styles.cancel} onClick={onClose}>
			Cancel
		</Button>
	</Sheet>
);

export default AnswerSheet;
