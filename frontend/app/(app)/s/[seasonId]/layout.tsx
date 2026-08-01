import type { ReactNode } from 'react';
import { SeasonProvider } from '../../../../components/SeasonProvider';

/**
 * Server component purely so it can await `params`; the real work happens in
 * `SeasonProvider`, which subscribes once for every screen below this route.
 */
const SeasonLayout = async ({ children, params }: { children: ReactNode; params: Promise<{ seasonId: string }> }) => {
	const { seasonId } = await params;

	return <SeasonProvider seasonId={seasonId}>{children}</SeasonProvider>;
};

export default SeasonLayout;
