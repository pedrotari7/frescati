import * as stylex from '@stylexjs/stylex';
import type { TeamOdds } from '@shared/matchday';
import { colors, tint } from '../../app/tokens.stylex';
import { teamName, teamStyle } from '../TeamBadge';
import Section from './Section';

const grow = stylex.keyframes({ from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } });

const styles = stylex.create({
	list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
	row: { display: 'grid', gridTemplateColumns: '64px 1fr 44px', alignItems: 'center', gap: 10 },
	team: { color: colors.ink, fontWeight: 600, fontSize: 14 },
	track: { height: 10, borderRadius: 999, backgroundColor: tint.white6, overflow: 'hidden' },
	bar: {
		height: '100%',
		borderRadius: 999,
		transformOrigin: 'left',
		animationName: grow,
		animationDuration: '0.8s',
		animationTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
		animationFillMode: 'both',
	},
	width: (percent: number) => ({ width: `${percent}%` }),
	percent: { color: colors.ink, fontVariantNumeric: 'tabular-nums', fontWeight: 700, textAlign: 'right' },
});

/** Each team's chance of topping the table tonight, as a bar per team in its bib colour. */
const Odds = ({ odds }: { odds: TeamOdds[] }) => (
	<Section title="Tonight's odds">
		<p {...stylex.props(styles.team)}>Chance of topping the table</p>
		<ul {...stylex.props(styles.list)}>
			{odds.map(({ team, percent }) => (
				<li key={team} aria-label={`Team ${teamName(team)}, ${percent}%`} {...stylex.props(styles.row)}>
					<span {...stylex.props(styles.team)} aria-hidden='true'>
						Team {teamName(team)}
					</span>
					<span {...stylex.props(styles.track)} aria-hidden='true'>
						<span {...stylex.props(styles.bar, teamStyle(team).bar, styles.width(percent))} />
					</span>
					<span {...stylex.props(styles.percent)} aria-hidden='true'>
						{percent}%
					</span>
				</li>
			))}
		</ul>
	</Section>
);

export default Odds;
