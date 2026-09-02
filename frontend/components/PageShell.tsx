import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import BottomNav from './BottomNav';
import type { NavItem } from './BottomNav';
import TopBar from './TopBar';
import { bp } from '../app/tokens.stylex';
import { utils } from '../lib/styles';

const styles = stylex.create({
	root: { minHeight: '100dvh' },
	/*
	 * `lg:pb-8` beside `pb-28` was two classes setting one property, settled by
	 * source order. Here the breakpoint is a condition on the one value, so the
	 * desktop case cannot be lost to whichever rule Tailwind happened to emit
	 * second.
	 */
	main: { marginInline: 'auto', maxWidth: 896, paddingBottom: { default: 112, [bp.lg]: 32 } },
	mainNoTabs: { paddingBottom: 32 },
	body: { paddingTop: 64 },
});

/**
 * Standard chrome for every signed-in screen: fixed top bar, scrollable body,
 * fixed bottom nav on mobile.
 *
 * The body carries the padding that clears both bars: 64px for the header
 * (plus the notch) and 112px for the nav (plus the home indicator).
 *
 * Screens outside the tabs, the season picker, pass no `navItems` and get a
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
		<div {...stylex.props(styles.root)}>
			<TopBar title={title} subtitle={subtitle} backHref={backHref} navItems={tabs} adminHref={adminHref} />

			<main {...stylex.props(utils.ptSafe, styles.main, tabs.length === 0 && styles.mainNoTabs)}>
				<div {...stylex.props(styles.body)}>{children}</div>
			</main>

			{tabs.length > 0 && <BottomNav items={tabs} sectionHrefs={sectionHrefs} />}
		</div>
	);
};

export default PageShell;
