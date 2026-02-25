import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';

function DailyBonus() {
  const { user, isLoading, isDailyAvailable, claimDailyBonus } = useAuth();

  return (
    <section className="page-section">
      {/* PAGE HEADER */}
      <header className="page-header">
        <h1>Daily Bonus</h1>
        <p>Claim your once-per-day reward and grow your bankroll.</p>
      </header>

      {/* DAILY BONUS CARD */}
      <Card className="daily-card">
        <h3>Today&apos;s Reward</h3>
        <p className="wallet-value">+${user.dailyReward}</p>
        <p className="daily-status">
          {isDailyAvailable ? 'Available now' : 'Already claimed today. Come back tomorrow.'}
        </p>
        <Button onClick={claimDailyBonus} disabled={!isDailyAvailable || isLoading}>
          {isDailyAvailable ? 'Claim Daily Bonus' : 'Claimed'}
        </Button>
      </Card>
    </section>
  );
}

export default DailyBonus;
