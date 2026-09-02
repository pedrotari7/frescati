import * as stylex from '@stylexjs/stylex';
import { formatSek } from '@shared/format';
import type { FinanceSummary } from '@shared/finances';
import { bp, colors, tint } from '../app/tokens.stylex';
import { surfaces, text } from '../lib/styles';

const styles = stylex.create({
	/* One column on a phone, both cards side by side once there's room. */
	grid: { display: 'grid', gap: 12, gridTemplateColumns: { default: '1fr', [bp.sm]: '1fr 1fr' } },

	card: { display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 16, padding: 16 },
	headline: { marginTop: 4, fontSize: 24, lineHeight: '32px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
	headlineInk: { color: colors.ink },
	headlineCovered: { color: colors.in },
	headlineOverdrawn: { color: colors.out },
	note: { color: colors.faint, marginTop: 4, fontSize: 12, lineHeight: 1.625 },

	list: {
		borderTopWidth: 1,
		borderTopStyle: 'solid',
		borderTopColor: tint.white5,
		display: 'flex',
		flexDirection: 'column',
		gap: 4,
		paddingTop: 12,
		fontSize: 12,
		lineHeight: '16px',
	},
	row: { display: 'flex', justifyContent: 'space-between', gap: 12 },
	label: { color: colors.faint },
	amount: { fontVariantNumeric: 'tabular-nums', color: colors.ink },
	amountOwed: { color: colors.pending },
	amountMuted: { color: colors.muted },
});

/** One line of a card: a label, a number, and whether the number is bad news. */
const Row = ({ label, amount, tone }: { label: string; amount: number; tone?: 'owed' | 'muted' }) => (
	<div {...stylex.props(styles.row)}>
		<dt {...stylex.props(styles.label)}>{label}</dt>
		<dd
			{...stylex.props(
				styles.amount,
				tone === 'owed' && styles.amountOwed,
				tone === 'muted' && styles.amountMuted
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
		<div {...stylex.props(styles.grid)}>
			<section {...stylex.props(surfaces.glass, styles.card)}>
				<div>
					<h2 {...stylex.props(text.sectionHeading)}>The season</h2>
					<p
						{...stylex.props(styles.headline, covered ? styles.headlineCovered : styles.headlineInk)}
						data-testid='season-shortfall'
					>
						{entry.target === 0 ? 'Free' : covered ? 'Paid for' : `${formatSek(entry.short)} to go`}
					</p>
					<p {...stylex.props(styles.note)}>
						{entry.target === 0
							? 'No bill has been set for this season.'
							: `${formatSek(entry.target)} for the season, split ${memberCount === 1 ? 'between 1 member' : `between ${memberCount} members`}.`}
					</p>
				</div>

				<dl {...stylex.props(styles.list)}>
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

			<section {...stylex.props(surfaces.glass, styles.card)}>
				<div>
					<h2 {...stylex.props(text.sectionHeading)}>Equipment money</h2>
					<p
						{...stylex.props(
							styles.headline,
							extras.balance < 0 ? styles.headlineOverdrawn : styles.headlineInk
						)}
						data-testid='equipment-balance'
					>
						{formatSek(extras.balance)}
					</p>
					<p {...stylex.props(styles.note)}>
						What the extras have paid in, less what it has bought. This is the ball money.
					</p>
				</div>

				<dl {...stylex.props(styles.list)}>
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
