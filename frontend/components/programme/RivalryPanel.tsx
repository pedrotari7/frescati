import * as stylex from '@stylexjs/stylex';
import type { Rivalry } from '@shared/matchday';
import { colors } from '../../app/tokens.stylex';
import Section from './Section';

const styles = stylex.create({
	pair: { color: colors.ink, fontSize: 20, fontWeight: 700, margin: 0 },
	line: { color: colors.muted, fontSize: 14, margin: 0 },
	run: { color: colors.pending, fontSize: 14, fontWeight: 600, margin: 0 },
});

const record = ({ a, b, aWins, bWins }: Rivalry, nameOf: (uid: string) => string): string => {
	if (aWins === bWins) return `Level at ${aWins}-${bWins}`;

	return aWins > bWins ? `${nameOf(a)} leads ${aWins}-${bWins}` : `${nameOf(b)} leads ${bWins}-${aWins}`;
};

/** The pair with the most history on opposite sides, and where it stands. */
const RivalryPanel = ({ rivalry, nameOf }: { rivalry: Rivalry; nameOf: (uid: string) => string }) => (
	<Section title={rivalry.tonight ? 'The rivalry' : 'Could meet tonight'}>
		<p {...stylex.props(styles.pair)}>
			{nameOf(rivalry.a)} v {nameOf(rivalry.b)}
		</p>
		<p {...stylex.props(styles.line)}>Met {rivalry.meetings} times</p>
		<p {...stylex.props(styles.line)}>{record(rivalry, nameOf)}</p>
		{rivalry.run && (
			<p {...stylex.props(styles.run)}>
				{nameOf(rivalry.run.uid)} has won the last {rivalry.run.count}
			</p>
		)}
	</Section>
);

export default RivalryPanel;
