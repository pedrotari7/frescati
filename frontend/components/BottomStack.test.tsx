import { render, screen } from '@testing-library/react';
import BottomStackHost, { BottomSlot } from './BottomStack';

describe('BottomStack', () => {
	// Three things want the bottom of the screen and they live in three
	// different subtrees, so they reach one container by portal rather than by
	// being children of it.
	it('puts everything into the one host, whatever subtree asked', () => {
		render(
			<div>
				<div>
					<BottomSlot order={1}>
						<p>update</p>
					</BottomSlot>
				</div>
				<BottomStackHost />
				<BottomSlot order={3}>
					<p>toast</p>
				</BottomSlot>
			</div>
		);

		const host = document.getElementById('bottom-stack')!;

		expect(host).toContainElement(screen.getByText('update'));
		expect(host).toContainElement(screen.getByText('toast'));
	});

	// Portals land in whatever order they happen to mount, which is not
	// something to leave to chance when one of these is a build waiting to be
	// installed and another is a nudge that has been waiting weeks.
	it('orders its occupants rather than taking them as they arrive', () => {
		render(
			<>
				<BottomStackHost />
				<BottomSlot order={3}>
					<p>toast</p>
				</BottomSlot>
				<BottomSlot order={1}>
					<p>update</p>
				</BottomSlot>
			</>
		);

		expect(screen.getByText('update').parentElement).toHaveClass('order-1');
		expect(screen.getByText('toast').parentElement).toHaveClass('order-3');
	});

	it('draws nothing at all when there is no host to draw into', () => {
		render(
			<BottomSlot order={1}>
				<p>orphan</p>
			</BottomSlot>
		);

		expect(screen.queryByText('orphan')).not.toBeInTheDocument();
	});
});
