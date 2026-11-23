'use client';

import { useSearchParams } from 'next/navigation';
import SeasonRecap from '../../../../../components/recap/SeasonRecap';

/** `?player=` is a profile's link to somebody's season, `?preview=1` is the debug screen's. */
const SeasonRecapPage = () => {
	const searchParams = useSearchParams();

	return (
		<SeasonRecap player={searchParams.get('player') ?? undefined} preview={searchParams.get('preview') === '1'} />
	);
};

export default SeasonRecapPage;
