import { render, screen } from '@testing-library/react';
import type { Rivalry } from '@shared/matchday';
import RivalryPanel from './RivalryPanel';

const names: Record<string, string> = { ana: 'Ana', joao: 'João' };
const nameOf = (uid: string) => names[uid];

const rivalry: Rivalry = {
	a: 'ana',
	b: 'joao',
	meetings: 14,
	aWins: 8,
	bWins: 6,
	draws: 0,
	run: null,
	tonight: true,
};

describe('RivalryPanel', () => {
	it('says how often they have met and who leads', () => {
		render(<RivalryPanel rivalry={rivalry} nameOf={nameOf} />);

		expect(screen.getByText('Ana v João')).toBeInTheDocument();
		expect(screen.getByText('Met 14 times')).toBeInTheDocument();
		expect(screen.getByText('Ana leads 8-6')).toBeInTheDocument();
	});

	it('names the leader whichever side of the pair they are', () => {
		render(<RivalryPanel rivalry={{ ...rivalry, aWins: 6, bWins: 8 }} nameOf={nameOf} />);

		expect(screen.getByText('João leads 8-6')).toBeInTheDocument();
	});

	it('says when it is level', () => {
		render(<RivalryPanel rivalry={{ ...rivalry, aWins: 5, bWins: 5, draws: 4 }} nameOf={nameOf} />);

		expect(screen.getByText('Level at 5-5')).toBeInTheDocument();
	});

	it('carries the current run', () => {
		render(<RivalryPanel rivalry={{ ...rivalry, run: { uid: 'joao', count: 3 } }} nameOf={nameOf} />);

		expect(screen.getByText('João has won the last 3')).toBeInTheDocument();
	});

	it('calls a pair without teams yet a possible meeting', () => {
		render(<RivalryPanel rivalry={{ ...rivalry, tonight: false }} nameOf={nameOf} />);

		expect(screen.getByText('Could meet tonight')).toBeInTheDocument();
	});
});
