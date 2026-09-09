import type { AnchorHTMLAttributes } from 'react';
import { Link as RouterLink } from 'react-router';

/**
 * What `next/link` is under the Vite build.
 *
 * The components import `next/link` and `vite.config.ts` points that name here,
 * so `app/` and `components/` compile unchanged under both builds. The contract
 * being met is small: an `href`, everything else forwarded to the anchor, and a
 * click that navigates without a document load.
 *
 * One thing is genuinely lost. `next/link` prefetches the route it points at
 * when the link enters the viewport, so by the time a thumb arrives the code is
 * usually there. React Router's declarative `Link` does not, and the routes in
 * `routes.tsx` are lazy, so the chunk is fetched on the tap instead. That is a
 * real regression on a phone-first app and it does not show up in a build
 * measurement, which is the sort of thing `docs/build.md` is for.
 */
const Link = ({ href, ...rest }: { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) => {
	// Anything absolute leaves the app, and a router asked to navigate to it
	// would treat the whole URL as a path. There is one today, the commit link
	// in `lib/build.ts`, and it is worth not breaking the next one.
	if (/^[a-z]+:|^\/\//i.test(href)) return <a href={href} {...rest} />;

	return <RouterLink to={href} {...rest} />;
};

export default Link;
