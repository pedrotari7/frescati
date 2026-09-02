import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { animations } from '../lib/styles';

const styles = stylex.create({
	svg: { width: 20, height: 20 },
	track: { opacity: 0.2 },
	head: { opacity: 0.9 },
});

const Spinner = ({ sx }: { sx?: StyleXStyles }) => (
	<svg {...stylex.props(styles.svg, animations.spin, sx)} viewBox='0 0 24 24' fill='none' aria-hidden='true'>
		<circle {...stylex.props(styles.track)} cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='3' />
		<path
			{...stylex.props(styles.head)}
			d='M22 12a10 10 0 0 0-10-10'
			stroke='currentColor'
			strokeWidth='3'
			strokeLinecap='round'
		/>
	</svg>
);

export default Spinner;
