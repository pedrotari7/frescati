'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CalendarDaysIcon, Cog6ToothIcon, UserCircleIcon, UsersIcon } from '@heroicons/react/24/outline';
import { classNames } from '../lib/utils/reactHelper';
import { hapticLight } from '../lib/utils/haptics';

export interface NavItem {
	href: string;
	label: string;
	icon: typeof CalendarDaysIcon;
}

export const seasonNavItems = (seasonId: string, isAdmin: boolean): NavItem[] => [
	{ href: `/s/${seasonId}`, label: 'Games', icon: CalendarDaysIcon },
	{ href: `/s/${seasonId}/members`, label: 'Squad', icon: UsersIcon },
	...(isAdmin ? [{ href: `/s/${seasonId}/admin`, label: 'Admin', icon: Cog6ToothIcon }] : []),
	{ href: '/me', label: 'Me', icon: UserCircleIcon },
];

export const globalNavItems = (): NavItem[] => [
	{ href: '/seasons', label: 'Seasons', icon: CalendarDaysIcon },
	{ href: '/me', label: 'Me', icon: UserCircleIcon },
];

/** Deepest matching href wins, so /s/x/admin doesn't also light up /s/x. */
export const activeIndexFor = (items: NavItem[], pathname: string): number => {
	let best = -1;
	let bestLength = -1;

	items.forEach((item, index) => {
		const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
		if (matches && item.href.length > bestLength) {
			best = index;
			bestLength = item.href.length;
		}
	});

	return best;
};

const BottomNav = ({ items }: { items: NavItem[] }) => {
	const pathname = usePathname();
	const activeIndex = activeIndexFor(items, pathname);

	const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
	const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

	// Measured rather than derived from a fraction of the width, so the pill
	// still lines up when the Admin tab appears or disappears.
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
			<div className='glass shadow-glass relative mx-2 mb-2 flex h-16 items-stretch rounded-2xl px-1'>
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
