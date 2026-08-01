import { classNames } from '../lib/utils/reactHelper';

const Spinner = ({ className = 'size-5' }: { className?: string }) => (
	<svg className={classNames('animate-spin', className)} viewBox='0 0 24 24' fill='none' aria-hidden='true'>
		<circle className='opacity-20' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='3' />
		<path
			className='opacity-90'
			d='M22 12a10 10 0 0 0-10-10'
			stroke='currentColor'
			strokeWidth='3'
			strokeLinecap='round'
		/>
	</svg>
);

export default Spinner;
