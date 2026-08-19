'use client';

import { useState } from 'react';
import { initials } from '@shared/format';
import { classNames } from '../lib/utils/reactHelper';

const SIZES = {
	sm: 'size-7 text-[10px]',
	md: 'size-9 text-xs',
	lg: 'size-12 text-sm',
};

const Avatar = ({
	displayName,
	photoURL,
	size = 'md',
	className = '',
}: {
	displayName: string;
	photoURL?: string | null;
	size?: keyof typeof SIZES;
	className?: string;
}) => {
	/**
	 * The photo that didn't load, if one didn't.
	 *
	 * Google's avatar URLs rotate and expire, and a broken one used to leave an
	 * empty ring — on every roster, team sheet and ladder that person appeared
	 * in, for good. The initials are already computed for everybody without a
	 * photo, so there is a fallback here; it just wasn't reachable.
	 *
	 * Held as the URL rather than a boolean so a profile picture changing gets
	 * a fresh try without an effect to reset a flag.
	 */
	const [failedUrl, setFailedUrl] = useState<string | null>(null);
	const showPhoto = !!photoURL && failedUrl !== photoURL;

	return (
		<div
			className={classNames(
				'bg-raised text-muted flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ring-1 ring-white/10',
				SIZES[size],
				className
			)}
			title={displayName}
		>
			{showPhoto ? (
				// Google avatar URLs are already sized; next/image would add a proxy
				// hop for no benefit on a 36px circle.
				<img
					src={photoURL}
					alt=''
					className='size-full object-cover'
					referrerPolicy='no-referrer'
					onError={() => setFailedUrl(photoURL)}
				/>
			) : (
				// A stand-in for a face rather than something to read out: almost
				// every one of these sits beside the same person's name, and "AN
				// Alice Ng" is what a screen reader made of the pair.
				<span aria-hidden='true'>{initials(displayName)}</span>
			)}
		</div>
	);
};

export default Avatar;
