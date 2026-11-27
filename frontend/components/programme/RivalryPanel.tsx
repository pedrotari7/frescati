import * as stylex from '@stylexjs/stylex';
import type { Rivalry } from '@shared/matchday';
import { colors, tint } from '../../app/tokens.stylex';
import type { PersonRow } from '../../lib/people';
import { teamStyle } from '../TeamBadge';
import Face from './Face';
import Section from './Section';

const styles = stylex.create({
	stage: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8 },
	corner: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 0 },
	name: {
		color: colors.ink,
		fontSize: 15,
		fontWeight: 700,
		margin: 0,
		textAlign: 'center',
		overflowWrap: 'anywhere',
	},
	score: {
		color: colors.ink,
		fontSize: 30,
		fontWeight: 800,
		fontVariantNumeric: 'tabular-nums',
		margin: 0,
		textAlign: 'center',
	},
	tally: { display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', gap: 2 },
	share: (colour: string, wins: number) => ({ backgroundColor: colour, flexGrow: wins, flexBasis: 0 }),
	line: { color: colors.muted, fontSize: 14, margin: 0, textAlign: 'center' },
	run: { color: colors.pending, fontSize: 14, fontWeight: 600, margin: 0, textAlign: 'center' },
});

const record = ({ a, b, aWins, bWins }: Rivalry, nameOf: (uid: string) => string): string => {
	if (aWins === bWins) return `Level at ${aWins}-${bWins}`;

	return aWins > bWins ? `${nameOf(a)} leads ${aWins}-${bWins}` : `${nameOf(b)} leads ${bWins}-${aWins}`;
};

/** Each of the pair in their bib tonight, or in the party colours before there are teams. */
const corners = (rivalry: Rivalry, squads: string[][]): [string, string] => {
	const bib = (uid: string) => squads.findIndex(squad => squad.includes(uid));
	const a = bib(rivalry.a);
	const b = bib(rivalry.b);

	return a >= 0 && b >= 0 && a !== b ? [teamStyle(a).colour, teamStyle(b).colour] : [colors.flare, colors.sky];
};

/** The pair with the most history on opposite sides, squared up, and where it stands. */
const RivalryPanel = ({
	rivalry,
	squads,
	personOf,
}: {
	rivalry: Rivalry;
	squads: string[][];
	personOf: (uid: string) => PersonRow;
}) => {
	const a = personOf(rivalry.a);
	const b = personOf(rivalry.b);
	const [aColour, bColour] = corners(rivalry, squads);
	const nameOf = (uid: string) => personOf(uid).displayName;

	return (
		<Section
			title={rivalry.tonight ? 'The rivalry' : 'Could meet tonight'}
			tone={{ ink: colors.flare, wash: tint.flare15 }}
			order={2}
		>
			<div {...stylex.props(styles.stage)} aria-label={`${a.displayName} v ${b.displayName}`} role='group'>
				<div {...stylex.props(styles.corner)}>
					<Face person={a} ring={aColour} size='xl' />
					<p {...stylex.props(styles.name)}>{a.displayName}</p>
				</div>
				<p {...stylex.props(styles.score)} aria-hidden='true'>
					{rivalry.aWins}-{rivalry.bWins}
				</p>
				<div {...stylex.props(styles.corner)}>
					<Face person={b} ring={bColour} size='xl' />
					<p {...stylex.props(styles.name)}>{b.displayName}</p>
				</div>
			</div>
			<div {...stylex.props(styles.tally)} aria-hidden='true'>
				<span {...stylex.props(styles.share(aColour, rivalry.aWins))} />
				{rivalry.draws > 0 && <span {...stylex.props(styles.share(tint.white15, rivalry.draws))} />}
				<span {...stylex.props(styles.share(bColour, rivalry.bWins))} />
			</div>
			<p {...stylex.props(styles.line)}>
				{record(rivalry, nameOf)} · Met {rivalry.meetings} times
			</p>
			{rivalry.run && (
				<p {...stylex.props(styles.run)}>
					{nameOf(rivalry.run.uid)} has won the last {rivalry.run.count}
				</p>
			)}
		</Section>
	);
};

export default RivalryPanel;
