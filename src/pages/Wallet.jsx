import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';

function Wallet() {
  const { user, isLoading, depositFunds, withdrawFunds } = useAuth();

  return (
    <section className="page-section">
      {/* PAGE HEADER */}
      <header className="page-header">
        <h1>Wallet</h1>
        <p>Manage your casino balance, deposits, and payouts.</p>
      </header>

      {/* WALLET STATS */}
      <div className="wallet-grid">
        <Card>
          <h3>Available Balance</h3>
          <p className="wallet-value">
            ${user.balance.toFixed(2)} {user.currency}
          </p>
        </Card>
        <Card>
          <h3>VIP Level</h3>
          <p className="wallet-value">{user.vipTier}</p>
        </Card>
        <Card>
          <h3>Daily Reward</h3>
          <p className="wallet-value">+${user.dailyReward}</p>
        </Card>
      </div>

      {/* WALLET ACTIONS */}
      <div className="wallet-actions">
        <Button onClick={() => depositFunds(50)} disabled={isLoading}>
          Deposit $50
        </Button>
        <Button variant="outline" onClick={() => withdrawFunds(25)} disabled={isLoading}>
          Withdraw $25
        </Button>
      </div>
    </section>
  );
}

export default Wallet;
