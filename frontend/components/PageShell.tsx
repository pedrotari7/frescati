import type { ReactNode } from 'react';
import BottomNav from './BottomNav';
import type { NavItem } from './BottomNav';
import TopBar from './TopBar';
import { classNames } from '../lib/utils/reactHelper';

/**
 * Standard chrome for every signed-in screen: fixed top bar, scrollable body,
 * fixed bottom nav on mobile.
 *
 * The body carries the padding that clears both bars — `pt-16` for the header
 * (plus the notch) and `pb-28` for the nav (plus the home indicator).
 *
 * Screens outside the tabs — the season picker — pass no `navItems` and get a
 * back chevron instead, rather than a second, differently shaped tab bar.
 *
 * There is deliberately no slot for per-screen buttons up here: one that shows
 * on a single screen shifts everything beside it as you move between screens.
 * Contextual controls belong in the body.
 */
const PageShell = ({
	title,
	subtitle,
	backHref,
	navItems,
	adminHref,
	children,
}: {
	title: string;
	subtitle?: string;
	backHref?: string;
	navItems?: NavItem[];
	adminHref?: string;
	children: ReactNode;
}) => {
	const tabs = navItems ?? [];
	const sectionHrefs = adminHref ? [adminHref] : [];

	return (
		<div className='min-h-dvh'>
			<TopBar title={title} subtitle={subtitle} backHref={backHref} navItems={tabs} adminHref={adminHref} />

			<main className={classNames('pt-safe mx-auto max-w-4xl lg:pb-8', tabs.length > 0 ? 'pb-28' : 'pb-8')}>
				<div className='pt-16'>{children}</div>
			</main>

			{tabs.length > 0 && <BottomNav items={tabs} sectionHrefs={sectionHrefs} />}
		</div>
	);
};

export default PageShell;
