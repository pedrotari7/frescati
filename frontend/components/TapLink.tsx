'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';
import { useTap } from '../hooks/useTap';

/**
 * A `next/link` for the fixed chrome, which goes on the press rather than on the
 * click.
 *
 * Same href, same prefetching, same markup. What it adds is `useTap`, which acts
 * on the press instead of waiting for a click the browser may never send. That
 * hook is where the reasoning lives.
 *
 * The navigation is therefore this component's rather than the Link's, which
 * makes the href an internal route only: a modifier click is handed back to the
 * browser, but nothing here would know what to do with a `target` or an address
 * off this app. The four handlers that carry it are this component's too, and
 * come off the props, so nobody can pass one that this would ignore. `onTap` is
 * the way in, for whatever else the press should do, the haptic on a tab.
 */
const TapLink = ({
	href,
	onTap,
	...props
}: Omit<ComponentProps<typeof Link>, 'href' | 'onClick' | 'onPointerDown' | 'onPointerUp' | 'onPointerCancel'> & {
	href: string;
	onTap?: () => void;
}) => {
	const router = useRouter();

	const tap = useTap(() => {
		onTap?.();
		router.push(href);
	});

	return <Link href={href} {...props} {...tap} />;
};

export default TapLink;
