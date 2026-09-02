'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { BeakerIcon } from '@heroicons/react/24/solid';
import * as stylex from '@stylexjs/stylex';
import { useAuth, signOutOfApp } from '../lib/auth';
import { DEV_MODE, loadDevUsers, signInAsDevUser } from '../lib/devUsers';
import type { DevUser, DevUserFile } from '../lib/devUsers';
import Avatar from './Avatar';
import Button from './Button';
import { bp, colors, tint } from '../app/tokens.stylex';
import { animations, elevation, surfaces, utils } from '../lib/styles';

const styles = stylex.create({
	/* Clear of the bottom bar on a phone, and of nothing in particular once the
	   tabs move into the top bar above lg. */
	fab: {
		color: colors.brand,
		position: 'fixed',
		right: 16,
		bottom: { default: 96, [bp.lg]: 24 },
		zIndex: 40,
		display: 'flex',
		width: 44,
		height: 44,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 9999,
	},
	beaker: { width: 20, height: 20 },

	dialog: { position: 'relative', zIndex: 50 },
	scrim: {
		backgroundColor: tint.canvas80,
		position: 'fixed',
		inset: 0,
		backdropFilter: 'blur(4px)',
		WebkitBackdropFilter: 'blur(4px)',
	},
	positioner: {
		position: 'fixed',
		inset: 0,
		display: 'flex',
		alignItems: { default: 'flex-end', [bp.sm]: 'center' },
		justifyContent: 'center',
		padding: 16,
	},
	/* Capped rather than sized, so a short list stays short and a long one
	   scrolls inside the panel instead of pushing the buttons off screen. */
	panel: {
		display: 'flex',
		maxHeight: '80dvh',
		width: '100%',
		maxWidth: 448,
		flexDirection: 'column',
		borderRadius: 24,
		padding: 20,
	},
	title: { color: colors.ink, fontSize: 18, lineHeight: '28px', fontWeight: 600 },
	blurb: { color: colors.muted, marginTop: 4, fontSize: 12, lineHeight: 1.625 },
	current: { color: colors.faint, marginTop: 8, fontSize: 12, lineHeight: '16px' },

	filter: {
		backgroundColor: colors.raised,
		color: colors.ink,
		marginTop: 16,
		height: 44,
		width: '100%',
		borderRadius: 12,
		borderWidth: 0,
		paddingInline: 12,
		fontSize: 14,
		lineHeight: '20px',
		boxShadow: { default: `inset 0 0 0 1px ${colors.line}`, ':focus': `inset 0 0 0 1px ${tint.brand50}` },
		outline: 'none',
		'::placeholder': { color: colors.faint },
	},

	/*
	 * The negative margin lets a row's hover surface reach the panel's padding
	 * while the scrollbar stays where the panel's edge is.
	 *
	 * `flexBasis` is the percentage rather than the length, and the difference is
	 * the whole list: the panel is capped at 80dvh but sized by its content, so
	 * its height is indefinite, and a column item basing off a length of 0 gets
	 * exactly that, no free space to grow into and every seeded account rendered
	 * into nothing. A percentage against an indefinite container falls back to
	 * the item's content instead. Tailwind's `flex-1` is `flex: 1 1 0%` and this
	 * is the half of it that mattered.
	 */
	list: {
		marginInline: -8,
		marginTop: 12,
		minHeight: 0,
		flexGrow: 1,
		flexBasis: '0%',
		overflowY: 'auto',
		paddingInline: 8,
	},
	row: {
		display: 'flex',
		width: '100%',
		alignItems: 'center',
		gap: 12,
		borderRadius: 12,
		padding: 8,
		textAlign: 'left',
		transitionProperty: 'background-color',
		transitionDuration: '0.2s',
	},
	rowCurrent: { backgroundColor: tint.brand10 },
	rowOther: { backgroundColor: { default: null, [bp.hover]: { default: null, ':hover': tint.white5 } } },

	rowBody: { minWidth: 0, flexGrow: 1, flexBasis: '0%' },
	name: {
		color: colors.ink,
		display: 'block',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		fontSize: 14,
		lineHeight: '20px',
		fontWeight: 500,
	},
	hint: {
		color: colors.faint,
		display: 'block',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		fontSize: 12,
		lineHeight: '16px',
	},

	none: { color: colors.faint, paddingBlock: 24, textAlign: 'center', fontSize: 14, lineHeight: '20px' },
	actions: { marginTop: 16, display: 'flex', gap: 12 },
});

/**
 * Become any seeded player, in two taps.
 *
 * Only exists when the app is pointed at the emulators. Production has one way
 * in and this is not it. It sits above everything else because it has to work
 * on the login screen too, which is where you spend most of your time when the
 * thing you are testing is "what does an admin see that a member doesn't".
 */
const DevUserSwitcher = () => {
	const { user } = useAuth();
	const [open, setOpen] = useState(false);
	const [file, setFile] = useState<DevUserFile | null>(null);
	const [query, setQuery] = useState('');

	useEffect(() => {
		if (DEV_MODE) void loadDevUsers().then(setFile);
	}, []);

	const matches = useMemo(() => {
		const needle = query.trim().toLowerCase();
		const users = file?.users ?? [];

		if (!needle) return users;

		return users.filter(candidate =>
			`${candidate.displayName} ${candidate.email} ${candidate.hint}`.toLowerCase().includes(needle)
		);
	}, [file, query]);

	// Hooks first: whether this renders at all is a build-time constant, but it
	// still has to be decided after they have run.
	if (!DEV_MODE) return null;

	const become = async (candidate: DevUser) => {
		await signInAsDevUser(candidate);
		setOpen(false);
		setQuery('');
	};

	return (
		<>
			<button
				type='button'
				onClick={() => setOpen(true)}
				aria-label='Switch seeded user'
				{...stylex.props(surfaces.glass, elevation.lift, styles.fab)}
			>
				<BeakerIcon {...stylex.props(styles.beaker)} aria-hidden='true' />
			</button>

			<Dialog open={open} onClose={() => setOpen(false)} {...stylex.props(styles.dialog)}>
				<div {...stylex.props(styles.scrim)} aria-hidden='true' />

				<div {...stylex.props(styles.positioner)}>
					<DialogPanel
						{...stylex.props(surfaces.glass, elevation.lift, animations.rise, utils.mbSafe, styles.panel)}
					>
						<DialogTitle {...stylex.props(styles.title)}>Sign in as</DialogTitle>

						<p {...stylex.props(styles.blurb)}>
							{file
								? `Scenario "${file.scenario}" · ${file.users.length} seeded accounts`
								: 'No seeded accounts found. Run pnpm seed.'}
						</p>

						{user && (
							<p {...stylex.props(styles.current)}>
								Currently {user.displayName}
								{user.isAppAdmin && ' · app admin'}
							</p>
						)}

						{file && (
							<input
								type='search'
								value={query}
								onChange={event => setQuery(event.target.value)}
								placeholder='Filter by name, email or role'
								{...stylex.props(styles.filter)}
							/>
						)}

						<div {...stylex.props(styles.list)}>
							{matches.map(candidate => (
								<button
									key={candidate.uid}
									type='button'
									onClick={() => become(candidate)}
									{...stylex.props(
										styles.row,
										candidate.uid === user?.uid ? styles.rowCurrent : styles.rowOther
									)}
								>
									<Avatar displayName={candidate.displayName} photoURL={candidate.photoURL} />

									<span {...stylex.props(styles.rowBody)}>
										<span {...stylex.props(styles.name)}>{candidate.displayName}</span>
										<span {...stylex.props(styles.hint)}>{candidate.hint}</span>
									</span>
								</button>
							))}

							{file && matches.length === 0 && (
								<p {...stylex.props(styles.none)}>Nobody matches &quot;{query}&quot;.</p>
							)}
						</div>

						<div {...stylex.props(styles.actions)}>
							<Button variant='ghost' fullWidth onClick={() => setOpen(false)}>
								Close
							</Button>
							{user && (
								<Button
									variant='secondary'
									fullWidth
									onClick={async () => {
										await signOutOfApp();
										setOpen(false);
									}}
								>
									Sign out
								</Button>
							)}
						</div>
					</DialogPanel>
				</div>
			</Dialog>
		</>
	);
};

export default DevUserSwitcher;
