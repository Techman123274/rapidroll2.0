const money = (v) => `$${Number(v || 0).toFixed(2)}`;

function SessionStatsPanel({ stats }) {
  return (
    <div className="bt-stats">
      <p>
        <span>Session P/L</span>
        <strong>{money(stats?.sessionPL)}</strong>
      </p>
      <p>
        <span>Total Wagered</span>
        <strong>{money(stats?.totalWagered)}</strong>
      </p>
      <p>
        <span>Last Payout</span>
        <strong>{money(stats?.lastPayout)}</strong>
      </p>
      <p>
        <span>Bets</span>
        <strong>{Number(stats?.betsCount || 0)}</strong>
      </p>
    </div>
  );
}

export default SessionStatsPanel;
