'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeftIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import * as stylex from '@stylexjs/stylex';
import { useAuth } from '../lib/auth';
import { useAppHistory } from './AppHistory';
import Avatar from './Avatar';
import { activeIndexFor, matchesHref } from './BottomNav';
import type { NavItem } from './BottomNav';
import { bp, colors, tint } from '../app/tokens.stylex';
import { surfaces, utils } from '../lib/styles';

const styles = stylex.create({
	/* The frosted panel, but only its bottom edge: the other three sit off screen. */
	header: {
		position: 'fixed',
		insetInline: 0,
		top: 0,
		zIndex: 30,
		borderTopWidth: 0,
		borderInlineStartWidth: 0,
		borderInlineEndWidth: 0,
	},
	inner: {
		marginInline: 'auto',
		display: 'flex',
		height: 64,
		maxWidth: 896,
		alignItems: 'center',
		gap: 12,
		paddingInline: 12,
	},

	round: {
		display: 'flex',
		width: 40,
		height: 40,
		flexShrink: 0,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 9999,
		transitionProperty: 'background-color, color',
		transitionDuration: '0.2s',
	},
	back: {
		color: { default: colors.muted, [bp.hover]: { default: null, ':hover': colors.ink } },
		backgroundColor: { default: null, ':active': tint.white5 },
		marginInlineStart: -4,
	},
	/* Held open above lg so the tabs don't slide sideways on a screen with no chevron. */
	slot: {
		marginInlineStart: -4,
		display: { default: 'none', [bp.lg]: 'block' },
		width: 40,
		height: 40,
		flexShrink: 0,
	},

	icon: { width: 24, height: 24 },

	title: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '0%' },
	/* Fixed column once the tabs are up here, so a longer title can't move them. */
	titleFixed: {
		minWidth: 0,
		width: { default: 'auto', [bp.lg]: 288 },
		flexGrow: { default: 1, [bp.lg]: 0 },
		flexShrink: { default: 1, [bp.lg]: 0 },
		flexBasis: { default: '0%', [bp.lg]: 'auto' },
	},
	heading: {
		color: colors.ink,
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		fontSize: 16,
		lineHeight: '24px',
		fontWeight: 600,
	},
	subtitle: {
		color: colors.faint,
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		fontSize: 12,
		lineHeight: '16px',
	},

	tabs: {
		display: { default: 'none', [bp.lg]: 'flex' },
		alignItems: 'center',
		gap: 4,
		flexGrow: 1,
		flexShrink: 1,
		flexBasis: '0%',
	},
	tab: {
		borderRadius: 8,
		paddingInline: 12,
		paddingBlock: 8,
		fontSize: 14,
		lineHeight: '20px',
		fontWeight: 500,
		transitionProperty: 'background-color, color',
		transitionDuration: '0.2s',
	},
	on: { backgroundColor: tint.brand15, color: colors.brand },
	off: {
		color: { default: colors.muted, [bp.hover]: { default: null, ':hover': colors.ink } },
		backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } },
	},

	avatar: { flexShrink: 0 },
});

const TopBar = ({
	title,
	subtitle,
	backHref,
	navItems = [],
	adminHref,
}: {
	title: string;
	subtitle?: string;
	/**
	 * Draws the back chevron. Omit on a tab root, which is nobody's child.
	 *
	 * Where the chevron goes when there is nothing behind it: a screen opened
	 * from a notification, a pasted link, the first load of the installed app.
	 * Every other arrival goes back the way it came; see `AppHistory`.
	 */
	backHref?: string;
	navItems?: NavItem[];
	/** Season admins only. Kept out of the tab bar so the tabs never reflow. */
	adminHref?: string;
}) => {
	const router = useRouter();
	const pathname = usePathname();
	const { user } = useAuth();
	const { canGoBack } = useAppHistory();
	const sectionHrefs = adminHref ? [adminHref] : [];
	const activeIndex = activeIndexFor(navItems, pathname, sectionHrefs);
	const adminIsActive = !!adminHref && matchesHref(pathname, adminHref);

	return (
		<header {...stylex.props(utils.ptSafe, surfaces.glass, styles.header)}>
			<div {...stylex.props(styles.inner)}>
				{/* Drawn on both, because the tabs are not the way back. Desktop
				    used to hide this on any screen carrying them, on the grounds
				    that they were up here instead, and they are, but they lead
				    to four places, none of which is the screen you came from. A
				    team sheet, a player, the kit register and every admin screen
				    sit below a tab rather than on one, so hiding it left them
				    with no way out at all bar the browser's own Back, which an
				    installed desktop window does not have. */}
				{backHref ? (
					<button
						type='button'
						onClick={() => (canGoBack ? router.back() : router.push(backHref))}
						aria-label='Back'
						{...stylex.props(styles.round, styles.back)}
					>
						<ChevronLeftIcon {...stylex.props(styles.icon)} />
					</button>
				) : (
					// A tab root has nowhere above it to go, and on a phone that is
					// simply no chevron. Up here it has to be a held slot, or the
					// tabs would sit a chevron's width further left on the three
					// screens without one and jump sideways every time you left
					// them.
					navItems.length > 0 && <div {...stylex.props(styles.slot)} aria-hidden='true' />
				)}

				<div {...stylex.props(navItems.length > 0 ? styles.titleFixed : styles.title)}>
					<h1 {...stylex.props(styles.heading)}>{title}</h1>
					{subtitle && <p {...stylex.props(styles.subtitle)}>{subtitle}</p>}
				</div>

				{/* On desktop the bottom nav is hidden, so the tabs live up here.
				    They start at a fixed offset and absorb the leftover width
				    themselves, which is what pins them: anything that comes and goes
				    on the right, the admin gear, a page action, eats into that
				    slack instead of shoving the tabs sideways. */}
				{navItems.length > 0 && (
					<nav {...stylex.props(styles.tabs)}>
						{navItems.map((item, index) => {
							const isActive = index === activeIndex;

							return (
								<Link
									key={item.href}
									href={item.href}
									aria-current={isActive ? 'page' : undefined}
									{...stylex.props(styles.tab, isActive ? styles.on : styles.off)}
								>
									{item.label}
								</Link>
							);
						})}
					</nav>
				)}

				{/* Admin lives here rather than in the tab bar. It resolves once,
				    with the rest of the season, and then holds the same slot on
				    every screen below it, so moving around never moves it. */}
				{adminHref && (
					<Link
						href={adminHref}
						aria-label='Season admin'
						aria-current={adminIsActive ? 'page' : undefined}
						{...stylex.props(styles.round, adminIsActive ? styles.on : styles.off)}
					>
						<Cog6ToothIcon {...stylex.props(styles.icon)} aria-hidden='true' />
					</Link>
				)}

				{user && (
					<Link href='/me' aria-label='Your profile' {...stylex.props(styles.avatar)}>
						<Avatar displayName={user.displayName} photoURL={user.photoURL} size='md' />
					</Link>
				)}
			</div>
		</header>
	);
};

export default TopBar;
