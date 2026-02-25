import { useEffect, useMemo, useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const tabs = ['all', 'daily', 'weekly', 'event', 'completed'];

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

const formatDuration = (targetDate) => {
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return '00:00:00';
  const totalSec = Math.floor(diff / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

function Challenges() {
  const { token, syncUser } = useAuth();
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({
    challenges: [],
    stats: { daily: {}, weekly: {} },
    resetAt: { daily: null, weekly: null }
  });
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.getChallengesState(token);
      setData(response);
    } catch (err) {
      setError(err.message || 'Failed to load challenges');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const visibleChallenges = useMemo(() => {
    const rows = data.challenges || [];
    if (activeTab === 'all') return rows;
    if (activeTab === 'completed') return rows.filter((row) => row.completed);
    return rows.filter((row) => row.type === activeTab);
  }, [data.challenges, activeTab]);

  const claim = async (challengeId) => {
    try {
      setError('');
      const response = await api.claimChallenge(token, challengeId);
      if (response.user) syncUser(response.user);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to claim challenge reward');
    }
  };

  const dailyReset = data.resetAt?.daily ? formatDuration(data.resetAt.daily) : '--:--:--';
  const weeklyReset = data.resetAt?.weekly ? formatDuration(data.resetAt.weekly) : '--:--:--';

  return (
    <section className="page-section">
      <header className="page-header">
        <h1>Challenges</h1>
        <p>Daily, weekly, and event missions with live progress and claimable rewards.</p>
      </header>

      <div className="challenge-stats-grid">
        <Card className="challenge-stat-card">
          <h3>Daily Progress</h3>
          <p>Wagered: {formatMoney(data.stats?.daily?.wagered || 0)}</p>
          <p>Rounds: {Number(data.stats?.daily?.betsCount || 0)}</p>
          <p>Resets in: {dailyReset}</p>
        </Card>
        <Card className="challenge-stat-card">
          <h3>Weekly Progress</h3>
          <p>Wagered: {formatMoney(data.stats?.weekly?.wagered || 0)}</p>
          <p>Distinct Games: {Number(data.stats?.weekly?.distinctGames || 0)}</p>
          <p>Resets in: {weeklyReset}</p>
        </Card>
      </div>

      <div className="promo-filters" role="tablist" aria-label="Challenge filter tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`promo-filter ${activeTab === tab ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'all' ? 'All' : tab === 'completed' ? 'Completed' : tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {error ? <p className="bt-error">{error}</p> : null}
      {loading ? <p className="challenge-loading">Loading challenges...</p> : null}

      <div className="challenge-grid">
        {visibleChallenges.map((challenge) => {
          const canClaim = challenge.completed && !challenge.claimed;
          return (
            <Card key={challenge.id} className={`challenge-card ${challenge.completed ? 'is-complete' : ''}`}>
              <div className="challenge-head">
                <h3>{challenge.title}</h3>
                <span className={`challenge-badge challenge-${challenge.type}`}>{challenge.type}</span>
              </div>

              <p className="challenge-target">
                Target: {challenge.target} • Progress: {challenge.progress}
              </p>

              <div className="challenge-progress-track" aria-label={`${challenge.progressPercent}% complete`}>
                <span style={{ width: `${challenge.progressPercent}%` }} />
              </div>

              <p className="challenge-reward">Reward: {formatMoney(challenge.reward)}</p>

              {challenge.claimed ? (
                <Button variant="outline" disabled>
                  Claimed
                </Button>
              ) : (
                <Button variant={canClaim ? 'primary' : 'outline'} disabled={!canClaim} onClick={() => void claim(challenge.id)}>
                  {canClaim ? 'Claim Reward' : 'In Progress'}
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      {!loading && visibleChallenges.length === 0 && (
        <Card>
          <p className="challenge-loading">No challenges found for this filter.</p>
        </Card>
      )}

      <p className="challenge-clock" aria-hidden="true">
        Updated: {new Date(clock).toLocaleTimeString()}
      </p>
    </section>
  );
}

export default Challenges;
