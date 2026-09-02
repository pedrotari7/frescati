'use client';

import type { ReactNode } from 'react';
import { Switch } from '@headlessui/react';
import * as stylex from '@stylexjs/stylex';
import { colors, tint } from '../app/tokens.stylex';
import { hapticLight } from '../lib/utils/haptics';

const styles = stylex.create({
	/*
	 * The hairline between two switches lives on the switch rather than on the
	 * stack that holds them, because StyleX has no sibling selector to hang a
	 * `divide-y` on. `Switch.Group` renders a fragment, so this row is a real
	 * first child of whatever the caller stacks them in.
	 */
	row: {
		display: 'flex',
		alignItems: 'flex-start',
		gap: 12,
		paddingBlock: 8,
		borderTopWidth: { default: 1, ':first-child': 0 },
		borderTopStyle: 'solid',
		borderTopColor: tint.white5,
	},
	text: { minWidth: 0, flexGrow: 1 },
	label: { color: colors.ink, display: 'block', fontSize: 14, lineHeight: '20px', fontWeight: 500 },
	description: { color: colors.faint, marginTop: 2, fontSize: 12, lineHeight: 1.625 },

	track: {
		position: 'relative',
		marginTop: 2,
		display: 'inline-flex',
		height: 24,
		width: 44,
		flexShrink: 0,
		borderRadius: 9999,
		transitionProperty: 'background-color',
		transitionDuration: '0.15s',
		opacity: { default: null, ':disabled': 0.4 },
	},
	on: { backgroundColor: colors.brand },
	off: { backgroundColor: tint.white15 },

	knob: {
		backgroundColor: colors.canvas,
		pointerEvents: 'none',
		position: 'absolute',
		top: 2,
		left: 2,
		width: 20,
		height: 20,
		borderRadius: 9999,
		transitionProperty: 'transform',
		transitionDuration: '0.15s',
	},
	slid: { transform: 'translateX(20px)' },
	home: { transform: 'translateX(0)' },
});

/**
 * A labelled on/off switch. Built on the Headless UI primitive so it announces
 * itself properly and works from the keyboard; the styling is ours.
 */
const Toggle = ({
	label,
	description,
	checked,
	disabled = false,
	onChange,
}: {
	label: string;
	description?: ReactNode;
	checked: boolean;
	disabled?: boolean;
	onChange: (next: boolean) => void;
}) => (
	<Switch.Group>
		<div {...stylex.props(styles.row)}>
			<div {...stylex.props(styles.text)}>
				<Switch.Label {...stylex.props(styles.label)}>{label}</Switch.Label>
				{description && <p {...stylex.props(styles.description)}>{description}</p>}
			</div>

			<Switch
				checked={checked}
				disabled={disabled}
				onChange={next => {
					hapticLight();
					onChange(next);
				}}
				{...stylex.props(styles.track, checked ? styles.on : styles.off)}
			>
				<span {...stylex.props(styles.knob, checked ? styles.slid : styles.home)} aria-hidden='true' />
			</Switch>
		</div>
	</Switch.Group>
);

export default Toggle;
