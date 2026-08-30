'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CalendarDaysIcon, TrophyIcon, UserCircleIcon, UsersIcon } from '@heroicons/react/24/outline';
import { classNames } from '../lib/utils/reactHelper';
import { hapticLight } from '../lib/utils/haptics';

export interface NavItem {
	href: string;
	label: string;
	icon: typeof CalendarDaysIcon;
	/**
	 * Screens that sit below this tab but whose paths do not nest under its href.
	 *
	 * The deepest-prefix rule below otherwise hands a screen to whichever tab's
	 * href is a prefix of its path, and for a child of a season that is always the
	 * season root. That is how the kit register and the books ended up lighting
	 * Games, a tab across from the one they hang off.
	 */
	owns?: string[];
}

/**
 * The only tab bar in the app: the same four destinations, in the same order,
 * on every screen that has one.
 *
 * Nothing in here depends on data that arrives late, so the bar never reflows
 * under the user's thumb once it has been painted. That is also why Table is a
 * tab even before a single game has been confirmed, a tab that appeared once
 * results existed would move every tab beside it, and the empty state can
 * explain itself. Admin-only tools stay out for the same reason, behind the
 * gear in the top bar.
 */
export const seasonNavItems = (seasonId: string): NavItem[] => [
	{ href: `/s/${seasonId}`, label: 'Games', icon: CalendarDaysIcon },
	{
		href: `/s/${seasonId}/members`,
		label: 'Squad',
		icon: UsersIcon,
		// Kit and finances hang off Squad rather than taking a fifth and sixth tab
		// of their own. The Squad screen says why. Their paths sit beside the season
		// root rather than under /members, so the tab has to claim them by name.
		owns: [`/s/${seasonId}/kit`, `/s/${seasonId}/finances`],
	},
	{ href: `/s/${seasonId}/table`, label: 'Table', icon: TrophyIcon },
	{ href: '/me', label: 'Me', icon: UserCircleIcon },
];

export const seasonAdminHref = (seasonId: string) => `/s/${seasonId}/admin`;

export const matchesHref = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * Deepest matching href wins, so /s/x/members doesn't also light up /s/x, and a
 * tab's `owns` beats the season root for the screens that hang off it.
 *
 * `sectionHrefs` are routes that own themselves without owning a tab, the admin
 * area. Being inside one leaves every tab unlit rather than falling back to the
 * season root, and the top bar highlights the gear instead.
 */
export const activeIndexFor = (items: NavItem[], pathname: string, sectionHrefs: string[] = []): number => {
	let best = -1;
	let bestLength = -1;

	const consider = (href: string, index: number) => {
		if (matchesHref(pathname, href) && href.length > bestLength) {
			best = index;
			bestLength = href.length;
		}
	};

	items.forEach((item, index) => {
		consider(item.href, index);
		item.owns?.forEach(href => consider(href, index));
	});
	sectionHrefs.forEach(href => consider(href, -1));

	return best;
};

const BottomNav = ({ items, sectionHrefs }: { items: NavItem[]; sectionHrefs?: string[] }) => {
	const pathname = usePathname();
	const activeIndex = activeIndexFor(items, pathname, sectionHrefs);

	const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
	const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

	// Measured rather than derived from a fraction of the width, so the pill
	// lines up whatever the labels are and however wide the bar ends up.
	useEffect(() => {
		const update = () => {
			const element = itemRefs.current[activeIndex];
			setIndicator(element ? { left: element.offsetLeft, width: element.offsetWidth } : null);
		};

		update();
		window.addEventListener('resize', update);

		return () => window.removeEventListener('resize', update);
	}, [activeIndex, items.length]);

	return (
		<nav className='pb-safe fixed inset-x-0 bottom-0 z-30 lg:hidden'>
			<div className='glass-nav shadow-glass relative mx-2 mb-2 flex h-16 items-stretch rounded-2xl px-1'>
				{indicator && (
					<div
						className='bg-brand/15 ring-brand/25 absolute inset-y-2 rounded-xl ring-1 transition-all duration-300 ease-out'
						style={{ left: indicator.left, width: indicator.width }}
						aria-hidden='true'
					/>
				)}

				{items.map((item, index) => {
					const isActive = index === activeIndex;
					const Icon = item.icon;

					return (
						<Link
							key={item.href}
							href={item.href}
							ref={element => {
								itemRefs.current[index] = element;
							}}
							onClick={hapticLight}
							aria-current={isActive ? 'page' : undefined}
							className={classNames(
								'relative z-10 flex flex-1 flex-col items-center justify-center gap-1 rounded-xl transition-colors',
								isActive ? 'text-brand' : 'text-faint active:text-muted'
							)}
						>
							<Icon className='size-6' aria-hidden='true' />
							<span className='text-[10px] font-medium'>{item.label}</span>
						</Link>
					);
				})}
			</div>
		</nav>
	);
};

export default BottomNav;
