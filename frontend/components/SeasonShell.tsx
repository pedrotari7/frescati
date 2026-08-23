'use client';

import type { ReactNode } from 'react';
import { seasonAdminHref, seasonNavItems } from './BottomNav';
import PageShell from './PageShell';
import { useSeasonContext } from './SeasonProvider';

/**
 * `PageShell` for every screen under /s/[seasonId].
 *
 * The tabs and the admin gear are built here rather than page by page, so the
 * chrome can't drift between screens, and because it hangs off the season
 * layout's subscription, moving between those screens never rebuilds it.
 */
const SeasonShell = ({
	title,
	subtitle,
	backHref,
	children,
}: {
	title: string;
	subtitle?: string;
	backHref?: string;
	children: ReactNode;
}) => {
	const { seasonId, isAdmin } = useSeasonContext();

	return (
		<PageShell
			title={title}
			subtitle={subtitle}
			backHref={backHref}
			navItems={seasonNavItems(seasonId)}
			adminHref={isAdmin ? seasonAdminHref(seasonId) : undefined}
		>
			{children}
		</PageShell>
	);
};

export default SeasonShell;
