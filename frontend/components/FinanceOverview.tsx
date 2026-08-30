import { formatSek } from '@shared/format';
import type { FinanceSummary } from '@shared/finances';
import { classNames } from '../lib/utils/reactHelper';

/** One line of a card: a label, a number, and whether the number is bad news. */
const Row = ({ label, amount, tone }: { label: string; amount: number; tone?: 'owed' | 'muted' }) => (
	<div className='flex justify-between gap-3'>
		<dt className='text-faint'>{label}</dt>
		<dd
			className={classNames(
				'tabular-nums',
				tone === 'owed' ? 'text-pending' : tone === 'muted' ? 'text-muted' : 'text-ink'
			)}
		>
			{formatSek(amount)}
		</dd>
	</div>
);

/**
 * Both sides of the books, and they are not the same shape.
 *
 * The season's bill is a target: the entry fees exist to pay it and nothing
 * else, so the headline is how much of it is still missing and there is no
 * balance to spend. The extras' fees are the one real pot, so the headline there
 * is what is in it, because that is the number somebody checks before buying a
 * ball.
 *
 * This started as two identical cards over a `Pot` union and was worse for it: a
 * `spent` that was always zero on one side and a target that meant nothing on
 * the other, and a reader left to work out which columns applied where.
 */
const FinanceOverview = ({ summary, memberCount }: { summary: FinanceSummary; memberCount: number }) => {
	const { entry, extras } = summary;
	const covered = entry.target > 0 && entry.short === 0;

	return (
		<div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
			<section className='glass space-y-3 rounded-2xl p-4'>
				<div>
					<h2 className='text-faint text-xs font-semibold tracking-wider uppercase'>The season</h2>
					<p
						className={classNames(
							'mt-1 text-2xl font-semibold tabular-nums',
							covered ? 'text-in' : 'text-ink'
						)}
						data-testid='season-shortfall'
					>
						{entry.target === 0 ? 'Free' : covered ? 'Paid for' : `${formatSek(entry.short)} to go`}
					</p>
					<p className='text-faint mt-1 text-xs leading-relaxed'>
						{entry.target === 0
							? 'No bill has been set for this season.'
							: `${formatSek(entry.target)} for the season, split ${memberCount === 1 ? 'between 1 member' : `between ${memberCount} members`}.`}
					</p>
				</div>

				<dl className='space-y-1 border-t border-white/5 pt-3 text-xs'>
					<Row label='The bill' amount={entry.target} />
					<Row label='Collected' amount={entry.collected} />
					<Row
						label='Still owed'
						amount={entry.outstanding}
						tone={entry.outstanding > 0 ? 'owed' : undefined}
					/>
					{entry.waived > 0 && <Row label='Written off' amount={entry.waived} tone='muted' />}
				</dl>
			</section>

			<section className='glass space-y-3 rounded-2xl p-4'>
				<div>
					<h2 className='text-faint text-xs font-semibold tracking-wider uppercase'>Equipment money</h2>
					<p
						className={classNames(
							'mt-1 text-2xl font-semibold tabular-nums',
							extras.balance < 0 ? 'text-out' : 'text-ink'
						)}
						data-testid='equipment-balance'
					>
						{formatSek(extras.balance)}
					</p>
					<p className='text-faint mt-1 text-xs leading-relaxed'>
						What the extras have paid in, less what it has bought. This is the ball money.
					</p>
				</div>

				<dl className='space-y-1 border-t border-white/5 pt-3 text-xs'>
					<Row label='Collected' amount={extras.collected} />
					<Row label='Spent' amount={extras.spent} />
					<Row
						label='Still owed'
						amount={extras.outstanding}
						tone={extras.outstanding > 0 ? 'owed' : undefined}
					/>
					{extras.waived > 0 && <Row label='Written off' amount={extras.waived} tone='muted' />}
				</dl>
			</section>
		</div>
	);
};

export default FinanceOverview;
