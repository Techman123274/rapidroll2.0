import Card from '../components/ui/Card';

const standings = [
  { rank: 1, user: 'NeonJackpot', points: '12,850 pts' },
  { rank: 2, user: 'RapidQueen', points: '11,940 pts' },
  { rank: 3, user: 'CrashTiger', points: '11,220 pts' },
  { rank: 4, user: 'DiceGhost', points: '10,980 pts' },
  { rank: 5, user: 'SlotPilot', points: '10,420 pts' }
];

function Leaderboard() {
  return (
    <section className="page-section">
      {/* PAGE HEADER */}
      <header className="page-header">
        <h1>Leaderboard</h1>
        <p>Track top players across active games and weekly competitions.</p>
      </header>

      {/* LEADERBOARD */}
      <Card>
        <ul className="leaderboard-list">
          {standings.map((entry) => (
            <li key={entry.rank} className="leaderboard-item">
              <span className="leaderboard-rank">#{entry.rank}</span>
              <span>{entry.user}</span>
              <strong>{entry.points}</strong>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

export default Leaderboard;
