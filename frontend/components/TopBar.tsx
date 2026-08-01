'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../lib/auth';
import Avatar from './Avatar';
import type { NavItem } from './BottomNav';
import { classNames } from '../lib/utils/reactHelper';

const TopBar = ({
	title,
	subtitle,
	backHref,
	actions,
	navItems = [],
}: {
	title: string;
	subtitle?: string;
	/** Shows a back chevron on mobile. Omit on top-level tabs. */
	backHref?: string;
	actions?: ReactNode;
	navItems?: NavItem[];
}) => {
	const router = useRouter();
	const pathname = usePathname();
	const { user } = useAuth();

	return (
		<header className='pt-safe glass fixed inset-x-0 top-0 z-30 border-x-0 border-t-0'>
			<div className='mx-auto flex h-16 max-w-4xl items-center gap-3 px-3'>
				{backHref && (
					<button
						type='button'
						onClick={() => router.push(backHref)}
						aria-label='Back'
						className='text-muted hover:text-ink -ml-1 flex size-10 shrink-0 items-center justify-center rounded-full active:bg-white/5 lg:hidden'
					>
						<ChevronLeftIcon className='size-6' />
					</button>
				)}

				<div className='min-w-0 flex-1'>
					<h1 className='text-ink truncate text-base font-semibold'>{title}</h1>
					{subtitle && <p className='text-faint truncate text-xs'>{subtitle}</p>}
				</div>

				{/* On desktop the bottom nav is hidden, so the tabs live up here. */}
				<nav className='hidden items-center gap-1 lg:flex'>
					{navItems.map(item => {
						const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

						return (
							<Link
								key={item.href}
								href={item.href}
								className={classNames(
									'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
									isActive ? 'bg-brand/15 text-brand' : 'text-muted hover:text-ink hover:bg-white/5'
								)}
							>
								{item.label}
							</Link>
						);
					})}
				</nav>

				{actions}

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
