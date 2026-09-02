'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { initials } from '@shared/format';
import { colors, tint } from '../app/tokens.stylex';

const styles = stylex.create({
	root: {
		backgroundColor: colors.raised,
		color: colors.muted,
		display: 'flex',
		flexShrink: 0,
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
		borderRadius: 9999,
		fontWeight: 600,
		// Outside the circle, not inside it: `overflow: hidden` crops a photo to
		// the box, and an inset ring would be a hairline drawn over the face.
		boxShadow: `0 0 0 1px ${tint.white10}`,
	},
	photo: { width: '100%', height: '100%', objectFit: 'cover' },
	sm: { width: 28, height: 28, fontSize: 10 },
	md: { width: 36, height: 36, fontSize: 12, lineHeight: '16px' },
	lg: { width: 48, height: 48, fontSize: 14, lineHeight: '20px' },
});

const SIZES = { sm: styles.sm, md: styles.md, lg: styles.lg };

const Avatar = ({
	displayName,
	photoURL,
	size = 'md',
	sx,
}: {
	displayName: string;
	photoURL?: string | null;
	size?: keyof typeof SIZES;
	sx?: StyleXStyles;
}) => {
	/**
	 * The photo that didn't load, if one didn't.
	 *
	 * Google's avatar URLs rotate and expire, and a broken one used to leave an
	 * empty ring, on every roster, team sheet and ladder that person appeared
	 * in, for good. The initials are already computed for everybody without a
	 * photo, so there is a fallback here; it just wasn't reachable.
	 *
	 * Held as the URL rather than a boolean so a profile picture changing gets
	 * a fresh try without an effect to reset a flag.
	 */
	const [failedUrl, setFailedUrl] = useState<string | null>(null);
	const showPhoto = !!photoURL && failedUrl !== photoURL;

	return (
		<div {...stylex.props(styles.root, SIZES[size], sx)} title={displayName}>
			{showPhoto ? (
				// Google avatar URLs are already sized; next/image would add a proxy
				// hop for no benefit on a 36px circle.
				<img
					src={photoURL}
					alt=''
					{...stylex.props(styles.photo)}
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
