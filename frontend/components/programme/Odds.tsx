import * as stylex from '@stylexjs/stylex';
import type { TeamOdds } from '@shared/matchday';
import { colors, tint } from '../../app/tokens.stylex';
import type { PersonRow } from '../../lib/people';
import Avatar from '../Avatar';
import TeamBadge, { teamName, teamStyle } from '../TeamBadge';
import Section from './Section';

const grow = stylex.keyframes({ from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } });

/** Faces shown per team before the rest become a count. */
const FACES = 6;

const styles = stylex.create({
	caption: { color: colors.ink, fontWeight: 600, fontSize: 14, margin: 0 },
	list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
	row: { borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 },
	head: { display: 'flex', alignItems: 'center', gap: 10 },
	team: { color: colors.ink, fontWeight: 700, fontSize: 15, flexGrow: 1 },
	percent: { fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 22, lineHeight: '28px' },
	faces: { display: 'flex', alignItems: 'center', paddingLeft: 6 },
	face: { marginLeft: -6, boxShadow: `0 0 0 2px ${colors.surface}` },
	more: { color: colors.muted, fontSize: 12, fontWeight: 600, marginLeft: 6 },
	track: { display: 'block', height: 8, borderRadius: 999, backgroundColor: tint.white6, overflow: 'hidden' },
	bar: {
		display: 'block',
		height: '100%',
		borderRadius: 999,
		transformOrigin: 'left',
		animationName: grow,
		animationDuration: '0.9s',
		animationTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
		animationFillMode: 'both',
	},
	width: (percent: number) => ({ width: `${percent}%` }),
});

/** The first few faces of a team, and how many more there are. */
const Squad = ({ uids, personOf }: { uids: string[]; personOf: (uid: string) => PersonRow }) => (
	<span {...stylex.props(styles.faces)} aria-hidden='true'>
		{uids.slice(0, FACES).map(uid => {
			const person = personOf(uid);
			return (
				<Avatar
					key={uid}
					displayName={person.displayName}
					photoURL={person.photoURL}
					size='sm'
					sx={styles.face}
				/>
			);
		})}
		{uids.length > FACES && <span {...stylex.props(styles.more)}>+{uids.length - FACES}</span>}
	</span>
);

/**
 * Each team's chance of topping the table tonight: its bib, its players and a
 * bar in its colour, on a card washed in that colour.
 */
const Odds = ({
	odds,
	squads,
	personOf,
}: {
	odds: TeamOdds[];
	squads: string[][];
	personOf: (uid: string) => PersonRow;
}) => (
	<Section title="Tonight's odds" tone={{ ink: colors.brand, wash: tint.brand15 }} order={0}>
		<p {...stylex.props(styles.caption)}>Chance of topping the table</p>
		<ul {...stylex.props(styles.list)}>
			{odds.map(({ team, percent }) => {
				const bib = teamStyle(team);

				return (
					<li
						key={team}
						aria-label={`Team ${teamName(team)}, ${percent}%`}
						{...stylex.props(styles.row, bib.chip)}
					>
						<span {...stylex.props(styles.head)} aria-hidden='true'>
							<TeamBadge index={team} />
							<span {...stylex.props(styles.team)}>Team {teamName(team)}</span>
							<span {...stylex.props(styles.percent, bib.text)}>{percent}%</span>
						</span>
						<Squad uids={squads[team] ?? []} personOf={personOf} />
						<span {...stylex.props(styles.track)} aria-hidden='true'>
							<span {...stylex.props(styles.bar, bib.bar, styles.width(percent))} />
						</span>
					</li>
				);
			})}
		</ul>
	</Section>
);

export default Odds;
