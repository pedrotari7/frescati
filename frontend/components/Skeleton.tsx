import { classNames } from '../lib/utils/reactHelper';

export const SkeletonBlock = ({ className = '' }: { className?: string }) => (
	<div className={classNames('relative overflow-hidden rounded-xl bg-white/5', className)}>
		<div className='animate-shimmer absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent' />
	</div>
);

/** Mirrors the season home layout so the page doesn't jump when data lands. */
const Skeleton = () => (
	<div className='space-y-4 p-4'>
		<SkeletonBlock className='h-52 rounded-3xl' />
		<SkeletonBlock className='h-5 w-32' />
		<SkeletonBlock className='h-20' />
		<SkeletonBlock className='h-20' />
		<SkeletonBlock className='h-20' />
	</div>
);

export default Skeleton;
