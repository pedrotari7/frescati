import { useMemo } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { RatingLedgerEntry, Season } from '@shared/types';
import MoreLink from '../MoreLink';
import { ListCard, SectionHeading } from '../Section';

const styles = stylex.create({
	section: { display: 'flex', flexDirection: 'column', gap: 8 },
});

/**
 * A player's finished seasons, each opening its recap with their own season at
 * the end of it.
 *
 * Only seasons with a `recapReadyAt`, so nothing here links to a recap that
 * would only say it is not over yet. Newest first, the season people want to
 * look back on.
 */
const RecapLinks = ({
	uid,
	entries,
	seasonsById,
}: {
	uid: string;
	/** This player's ledger, which is what says which seasons they played in. */
	entries: Pick<RatingLedgerEntry, 'seasonId'>[];
	seasonsById: Map<string, Season>;
}) => {
	const seasons = useMemo(
		() =>
			[...new Set(entries.map(entry => entry.seasonId))]
				.map(seasonId => seasonsById.get(seasonId))
				.filter((season): season is Season & { recapReadyAt: string } => !!season?.recapReadyAt)
				.sort((a, b) => b.recapReadyAt.localeCompare(a.recapReadyAt)),
		[entries, seasonsById]
	);

	if (seasons.length === 0) return null;

	return (
		<section {...stylex.props(styles.section)}>
			<SectionHeading>Season recaps</SectionHeading>
			<ListCard>
				{seasons.map(season => (
					<MoreLink key={season.id} href={`/s/${season.id}/recap?player=${uid}`}>
						{season.name}
					</MoreLink>
				))}
			</ListCard>
		</section>
	);
};

export default RecapLinks;
