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
}) => (
	<div
		className={classNames(
			'bg-raised text-muted flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ring-1 ring-white/10',
			SIZES[size],
			className
		)}
		title={displayName}
	>
		{photoURL ? (
			// Google avatar URLs are already sized; next/image would add a proxy
			// hop for no benefit on a 36px circle.
			<img src={photoURL} alt='' className='size-full object-cover' referrerPolicy='no-referrer' />
		) : (
			initials(displayName)
		)}
	</div>
);

export default Avatar;
