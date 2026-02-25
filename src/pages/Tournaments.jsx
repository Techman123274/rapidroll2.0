import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

const events = [
  {
    title: 'Midnight Crash Cup',
    prize: '$25,000 Prize Pool',
    window: 'Starts in 2h 14m'
  },
  {
    title: 'Roulette Sprint',
    prize: '$12,000 Prize Pool',
    window: 'Live Now'
  },
  {
    title: 'Slots Weekend Clash',
    prize: '$40,000 Prize Pool',
    window: 'Starts Friday 18:00'
  }
];

function Tournaments() {
  return (
    <section className="page-section">
      {/* PAGE HEADER */}
      <header className="page-header">
        <h1>Tournaments</h1>
        <p>Compete in timed events, climb brackets, and secure prize pools.</p>
      </header>

      {/* TOURNAMENT GRID */}
      <div className="promo-grid">
        {events.map((event) => (
          <Card key={event.title} className="promo-card promo-card-stake">
            <div className="media-placeholder">Tournament Banner</div>
            <h3>{event.title}</h3>
            <p>{event.prize}</p>
            <p>{event.window}</p>
            <Button as="link" to="/games">
              Enter Event
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default Tournaments;
