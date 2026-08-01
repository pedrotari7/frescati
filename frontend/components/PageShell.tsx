import type { ReactNode } from 'react';
import BottomNav from './BottomNav';
import type { NavItem } from './BottomNav';
import TopBar from './TopBar';

/**
 * Standard chrome for every signed-in screen: fixed top bar, scrollable body,
 * fixed bottom nav on mobile.
 *
 * The body carries the padding that clears both bars — `pt-16` for the header
 * (plus the notch) and `pb-28` for the nav (plus the home indicator).
 */
const PageShell = ({
	title,
	subtitle,
	backHref,
	actions,
	navItems,
	children,
}: {
	title: string;
	subtitle?: string;
	backHref?: string;
	actions?: ReactNode;
	navItems: NavItem[];
	children: ReactNode;
}) => (
	<div className='min-h-dvh'>
		<TopBar title={title} subtitle={subtitle} backHref={backHref} actions={actions} navItems={navItems} />

		<main className='pt-safe mx-auto max-w-4xl pb-28 lg:pb-8'>
			<div className='pt-16'>{children}</div>
		</main>

		<BottomNav items={navItems} />
	</div>
);

export default PageShell;
