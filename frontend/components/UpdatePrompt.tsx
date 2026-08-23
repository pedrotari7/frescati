'use client';

import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { BottomSlot } from './BottomStack';
import Button from './Button';

/**
 * Offers the new build that is sitting behind the running one.
 *
 * No dismiss. Everything else that appears down here is a suggestion somebody
 * is entitled to refuse forever, the install banner writes its refusal to
 * `localStorage` and never asks again. This is a build already downloaded and
 * waiting, and the answer is either "now" or "next time you open the app",
 * which closing the tab already means. A dismiss button would offer a third
 * answer, "keep running the old one", that nobody wants and that is exactly
 * the state the whole change exists to get people out of.
 *
 * Sits in the same slot as `PwaInstallPrompt` and above it, on the rare
 * occasion both are up: an update is a thing to act on now, an install nudge
 * has been waiting weeks. That ordering is `BottomStack`'s to enforce now,
 * these two used to be separate fixed elements at the same offset, so "above"
 * meant "exactly on top of".
 */
const UpdatePrompt = ({ onReload }: { onReload: () => void }) => (
	<BottomSlot order={1}>
		<div className='bg-raised/95 shadow-glass border-line/60 animate-rise mx-auto flex max-w-md items-center gap-3 rounded-2xl border p-4 backdrop-blur-xl'>
			<div className='bg-brand/15 text-brand flex size-10 shrink-0 items-center justify-center rounded-xl'>
				<ArrowPathIcon className='size-5' aria-hidden='true' />
			</div>

			<div className='min-w-0 flex-1'>
				<p className='text-ink text-sm font-semibold'>A new version is ready</p>
				<p className='text-muted mt-0.5 text-xs'>Reload to pick it up.</p>
			</div>

			<Button size='sm' variant='primary' onClick={onReload}>
				Reload
			</Button>
		</div>
	</BottomSlot>
);

export default UpdatePrompt;
