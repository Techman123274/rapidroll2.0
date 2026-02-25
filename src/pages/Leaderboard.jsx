import { useEffect, useMemo, useState } from 'react';
import Card from '../components/ui/Card';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const periodTabs = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'all_time', label: 'All-time' }
];

const categoryTabs = [
  { id: 'total_winnings', label: 'Total Winnings' },
  { id: 'biggest_single_win', label: 'Biggest Win' },
  { id: 'most_games_played', label: 'Most Played' },
  { id: 'plinko_highs', label: 'Plinko Highs' },
  { id: 'mines_streak', label: 'Mines Wins' },
  { id: 'poker_wins', label: 'Poker Wins' }
];

const gameFilters = ['all', 'crash', 'dice', 'roulette', 'mines', 'plinko', 'towers', 'limbo'];

const formatScore = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function Leaderboard() {
  const { token } = useAuth();
  const [period, setPeriod] = useState('daily');
  const [category, setCategory] = useState('total_winnings');
  const [game, setGame] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.getLeaderboard(token, { period, category, game, search });
        if (cancelled) return;
        setRows(response.rows || []);
        setMe(response.me || null);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Failed to load leaderboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token, period, category, game, search]);

  const podium = useMemo(() => rows.slice(0, 3), [rows]);

  return (
    <section className="page-section">
      <header className="page-header">
        <h1>Leaderboard</h1>
        <p>Filter by timeframe, category, and game to track top players and your rank.</p>
      </header>

      <div className="promo-filters" role="tablist" aria-label="Leaderboard period tabs">
        {periodTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`promo-filter ${period === tab.id ? 'is-active' : ''}`}
            onClick={() => setPeriod(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="promo-filters" role="tablist" aria-label="Leaderboard category tabs">
        {categoryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`promo-filter ${category === tab.id ? 'is-active' : ''}`}
            onClick={() => setCategory(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card className="leaderboard-filter-card">
        <div className="leaderboard-filters-row">
          <label>
            Game
            <select value={game} onChange={(event) => setGame(event.target.value)}>
              {gameFilters.map((item) => (
                <option key={item} value={item}>
                  {item === 'all' ? 'All Games' : item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search User
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="username"
            />
          </label>
        </div>
      </Card>

      <section className="leaderboard-podium" aria-label="Top three players">
        {podium.map((entry) => (
          <Card key={entry.userId} className={`leaderboard-podium-card rank-${entry.rank}`}>
            <p className="podium-rank">#{entry.rank}</p>
            <h3>{entry.username}</h3>
            <p>{entry.vipTier}</p>
            <strong>{formatScore(entry.score)}</strong>
          </Card>
        ))}
      </section>

      {me && (
        <Card className="leaderboard-me-card">
          <p>
            Your Rank: <strong>#{me.rank}</strong> • Score: <strong>{formatScore(me.score)}</strong>
          </p>
        </Card>
      )}

      {error ? <p className="bt-error">{error}</p> : null}
      {loading ? <p className="challenge-loading">Loading leaderboard...</p> : null}

      <Card className="leaderboard-table-card">
        <div className="leaderboard-table-head">
          <span>Rank</span>
          <span>Player</span>
          <span>Tier</span>
          <span>Score</span>
        </div>
        <div className="leaderboard-table-body">
          {rows.map((entry) => (
            <article key={`${entry.userId}-${entry.rank}`} className={`leaderboard-table-row ${me?.userId === entry.userId ? 'is-me' : ''}`}>
              <span>#{entry.rank}</span>
              <span>{entry.username}</span>
              <span>{entry.vipTier}</span>
              <strong>{formatScore(entry.score)}</strong>
            </article>
          ))}
        </div>
      </Card>
    </section>
  );
}

export default Leaderboard;
