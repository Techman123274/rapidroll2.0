import { useEffect, useMemo, useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

function Vip() {
  const { user, token, syncUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError('');
      try {
        const data = await api.getVipSummary(token);
        if (!mounted) return;
        setSummary(data.vip);
        if (data.user) syncUser?.(data.user);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || 'Failed to load VIP summary.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [token, syncUser]);

  const topGames = useMemo(() => (summary?.gamesTracked || []).slice(0, 4), [summary]);

  return (
    <section className="page-section vip-page">
      {/* PAGE HEADER */}
      <header className="page-header vip-header">
        <h1>VIP Lounge</h1>
        <p>Progression, level rewards, and wagering milestones across all tracked games.</p>
      </header>

      {/* VIP PROGRESS HERO */}
      <Card className="vip-hero-card">
        <div className="vip-hero-row">
          <div>
            <p className="vip-label">Current Tier</p>
            <h2>{summary?.currentTier || user.vipTier}</h2>
          </div>
          <div>
            <p className="vip-label">Next Tier</p>
            <h3>{summary?.nextTier || 'MAX'}</h3>
          </div>
          <div>
            <p className="vip-label">Rakeback</p>
            <h3>{summary?.rakebackPercent || 0}%</h3>
          </div>
          <div>
            <p className="vip-label">Level Reward</p>
            <h3>{formatMoney(summary?.levelReward || 0)}</h3>
          </div>
        </div>

        <div className="vip-progress-track" aria-label="VIP progress bar">
          <span className="vip-progress-fill" style={{ width: `${summary?.progressPercent || 0}%` }} />
        </div>
        <div className="vip-progress-meta">
          <span>
            {formatMoney(summary?.progressCurrent || 0)} / {formatMoney(summary?.progressTarget || 0)}
          </span>
          <strong>
            {summary?.nextTier ? `${formatMoney(summary?.remainingToNext || 0)} to ${summary.nextTier}` : 'Top tier reached'}
          </strong>
        </div>
      </Card>

      {error && <p className="vip-error">{error}</p>}

      {/* VIP CONTENT */}
      <div className="vip-grid vip-grid-advanced">
        <Card className="vip-stat-card">
          <h3>Total Wagered</h3>
          <p className="wallet-value">{formatMoney(user.totalWagered)}</p>
        </Card>
        <Card className="vip-stat-card">
          <h3>Total Won</h3>
          <p className="wallet-value">{formatMoney(user.totalWon)}</p>
        </Card>
        <Card className="vip-stat-card">
          <h3>30D Wagered</h3>
          <p className="wallet-value">{formatMoney(summary?.monthlyWagered || 0)}</p>
        </Card>
        <Card className="vip-stat-card">
          <h3>Daily Reward</h3>
          <p className="wallet-value">{formatMoney(user.dailyReward)}</p>
        </Card>
      </div>

      <div className="vip-grid vip-grid-advanced">
        <Card className="vip-panel">
          <h3>Games Tracked</h3>
          {isLoading ? (
            <p>Loading activity...</p>
          ) : topGames.length === 0 ? (
            <p>No tracked bets yet.</p>
          ) : (
            <ul className="vip-list">
              {topGames.map((row) => (
                <li key={row.game}>
                  <span>{row.game}</span>
                  <strong>{formatMoney(row.totalSpent)}</strong>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="vip-panel">
          <h3>Recent Daily Claims</h3>
          {isLoading ? (
            <p>Loading claims...</p>
          ) : summary?.recentDailyClaims?.length ? (
            <ul className="vip-list">
              {summary.recentDailyClaims.map((claim) => (
                <li key={claim.id}>
                  <span>{new Date(claim.claimedAt).toLocaleDateString()}</span>
                  <strong>{formatMoney(claim.amount)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>No daily claims logged yet.</p>
          )}
        </Card>

        <Card className="vip-panel">
          <h3>VIP Rewards Ladder</h3>
          <ul className="vip-list">
            {(summary?.tiers || []).map((tier) => (
              <li key={tier.name} className={tier.name === (summary?.currentTier || user.vipTier) ? 'vip-tier-active' : ''}>
                <span>{tier.name}</span>
                <strong>{formatMoney(tier.reward)} reward</strong>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* VIP ACTIONS */}
      <div className="wallet-actions">
        <Button as="link" to="/daily">
          Claim Daily Bonus
        </Button>
        <Button as="link" to="/wallet" variant="outline">
          Open Wallet
        </Button>
      </div>
    </section>
  );
}

export default Vip;
