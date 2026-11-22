'use client';

import * as stylex from '@stylexjs/stylex';
import type { Due, SeasonFees } from '@shared/types';
import type { Payment } from '@shared/finances';
import { sameNumber, splitByPayee } from '@shared/finances';
import SwishPay from './SwishPay';
import { colors } from '../app/tokens.stylex';
import { text } from '../lib/styles';

const styles = stylex.create({
	blocks: { display: 'flex', flexDirection: 'column', gap: 24 },
	block: { display: 'flex', flexDirection: 'column', gap: 12 },
	note: { color: colors.faint, fontSize: 12, lineHeight: 1.625 },
});

/** Both pots in one block needs no heading, the section around it already names what is owed. */
const headingFor = (pots: Payment['pots']) => {
	if (pots.length > 1) return null;

	return pots[0] === 'entry' ? 'Season fee' : "Extras' fees";
};

/** Swish numbers are typed by hand, so compare what they dial rather than how they were written. */
const isMine = (swish: string, mySwish: string | null) => mySwish !== null && sameNumber(swish, mySwish);

/**
 * One Swish code for each number the viewer owes money to.
 *
 * The season fee and the extras' fees can be collected by different admins, so
 * the outstanding charges are split by payee and each group gets its own code.
 * A group that is paid to the viewer draws no code at all, because Swish refuses
 * a payment to your own number with the same "incorrect format" message it gives
 * a malformed link.
 */
const PaymentCodes = ({
	dues,
	fees,
	reference,
	mySwish,
	hasBook = true,
}: {
	dues: Pick<Due, 'kind' | 'amount' | 'status'>[];
	fees: Pick<SeasonFees, 'swish' | 'payees'>;
	reference: string;
	/** The viewer's own saved number, or null when they have none. */
	mySwish: string | null;
	/** Whether the screen has the book below it to mark a charge paid in. */
	hasBook?: boolean;
}) => {
	const payments = splitByPayee(dues, fees);

	if (payments.length === 0) return null;

	return (
		<div {...stylex.props(styles.blocks)}>
			{payments.map(({ swish, pots, amount }) => {
				const heading = headingFor(pots);

				return (
					<div key={pots.join()} {...stylex.props(styles.block)}>
						{heading && <h3 {...stylex.props(text.sectionHeading)}>{heading}</h3>}

						{swish === undefined ? (
							<p {...stylex.props(styles.note)}>
								No Swish number is set for this, so ask an admin where to send it.
							</p>
						) : isMine(swish, mySwish) ? (
							<p {...stylex.props(styles.note)}>
								{hasBook
									? 'This one is paid to you. Mark it paid in the book below.'
									: 'This one is paid to you, so mark it paid yourself.'}
							</p>
						) : (
							<SwishPay payee={swish} amount={amount} message={reference} />
						)}
					</div>
				);
			})}
		</div>
	);
};

export default PaymentCodes;
