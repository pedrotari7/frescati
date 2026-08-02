'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeftIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../lib/auth';
import Avatar from './Avatar';
import { activeIndexFor, matchesHref } from './BottomNav';
import type { NavItem } from './BottomNav';
import { classNames } from '../lib/utils/reactHelper';

const TopBar = ({
	title,
	subtitle,
	backHref,
	navItems = [],
	adminHref,
}: {
	title: string;
	subtitle?: string;
	/** Shows a back chevron on mobile. Omit on top-level tabs. */
	backHref?: string;
	navItems?: NavItem[];
	/** Season admins only. Kept out of the tab bar so the tabs never reflow. */
	adminHref?: string;
}) => {
	const router = useRouter();
	const pathname = usePathname();
	const { user } = useAuth();
	const sectionHrefs = adminHref ? [adminHref] : [];
	const activeIndex = activeIndexFor(navItems, pathname, sectionHrefs);
	const adminIsActive = !!adminHref && matchesHref(pathname, adminHref);

	return (
		<header className='pt-safe glass fixed inset-x-0 top-0 z-30 border-x-0 border-t-0'>
			<div className='mx-auto flex h-16 max-w-4xl items-center gap-3 px-3'>
				{backHref && (
					<button
						type='button'
						onClick={() => router.push(backHref)}
						aria-label='Back'
						className={classNames(
							'text-muted hover:text-ink -ml-1 flex size-10 shrink-0 items-center justify-center rounded-full active:bg-white/5',
							// Desktop hides the chevron because the tabs are up here
							// instead — unless this screen has none, and it's the only
							// way out.
							navItems.length > 0 && 'lg:hidden'
						)}
					>
						<ChevronLeftIcon className='size-6' />
					</button>
				)}

				{/* Fixed column once the tabs are up here, so a longer title can't
				    move them either. */}
				<div className={classNames('min-w-0 flex-1', navItems.length > 0 && 'lg:w-72 lg:flex-none')}>
					<h1 className='text-ink truncate text-base font-semibold'>{title}</h1>
					{subtitle && <p className='text-faint truncate text-xs'>{subtitle}</p>}
				</div>

				{/* On desktop the bottom nav is hidden, so the tabs live up here.
				    They start at a fixed offset and absorb the leftover width
				    themselves, which is what pins them: anything that comes and goes
				    on the right — the admin gear, a page action — eats into that
				    slack instead of shoving the tabs sideways. */}
				{navItems.length > 0 && (
					<nav className='hidden items-center gap-1 lg:flex lg:flex-1'>
						{navItems.map((item, index) => {
							const isActive = index === activeIndex;

							return (
								<Link
									key={item.href}
									href={item.href}
									aria-current={isActive ? 'page' : undefined}
									className={classNames(
										'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
										isActive
											? 'bg-brand/15 text-brand'
											: 'text-muted hover:text-ink hover:bg-white/5'
									)}
								>
									{item.label}
								</Link>
							);
						})}
					</nav>
				)}

				{/* Admin lives here rather than in the tab bar. It resolves once,
				    with the rest of the season, and then holds the same slot on
				    every screen below it — so moving around never moves it. */}
				{adminHref && (
					<Link
						href={adminHref}
						aria-label='Season admin'
						aria-current={adminIsActive ? 'page' : undefined}
						className={classNames(
							'flex size-10 shrink-0 items-center justify-center rounded-full transition-colors',
							adminIsActive ? 'bg-brand/15 text-brand' : 'text-muted hover:text-ink hover:bg-white/5'
						)}
					>
						<Cog6ToothIcon className='size-6' aria-hidden='true' />
					</Link>
				)}

				{user && (
					<Link href='/me' aria-label='Your profile' className='shrink-0'>
						<Avatar displayName={user.displayName} photoURL={user.photoURL} size='md' />
					</Link>
				)}
			</div>
		</header>
	);
};

export default TopBar;
