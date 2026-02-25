import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

const challenges = [
  {
    title: '5-Game Daily Streak',
    reward: '+$12 Bonus Credit',
    objective: 'Play any 5 games today.'
  },
  {
    title: 'High Roller Mission',
    reward: '+$25 Cashback',
    objective: 'Wager $500 total in table games.'
  },
  {
    title: 'Quick Win Sprint',
    reward: '+15% Reload Token',
    objective: 'Win 3 rounds in Crash Zone.'
  }
];

function Challenges() {
  return (
    <section className="page-section">
      {/* PAGE HEADER */}
      <header className="page-header">
        <h1>Challenges</h1>
        <p>Complete missions to unlock boosts, credits, and limited perks.</p>
      </header>

      {/* CHALLENGE GRID */}
      <div className="promo-grid">
        {challenges.map((challenge) => (
          <Card key={challenge.title} className="promo-card">
            <h3>{challenge.title}</h3>
            <p>{challenge.objective}</p>
            <p>{challenge.reward}</p>
            <Button as="link" to="/games" variant="outline">
              Start Challenge
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default Challenges;
