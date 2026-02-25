import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

function SlotGamePage({ slot, isGameDisabled }) {
  if (!slot) {
    return (
      <Card className="game-play-card">
        <div className="media-placeholder">Slot configuration not found.</div>
      </Card>
    );
  }

  return (
    <section className="slot-page-layout">
      <Card className="game-play-card slot-page-main">
        <header className="slot-page-head">
          <h2>{slot.title}</h2>
          <p>
            {slot.provider} • {slot.category} • {slot.mode}
          </p>
        </header>

        <div className="slot-launcher-frame-wrap slot-frame-enhanced">
          {isGameDisabled ? (
            <div className="media-placeholder">Slot currently unavailable</div>
          ) : (
            <iframe
              title={slot.title}
              src={slot.launchUrl}
              className="slot-launcher-frame"
              loading="lazy"
              referrerPolicy="no-referrer"
              allow="fullscreen"
            />
          )}
        </div>

        <div className="wallet-actions">
          <Button as="link" to="/games" variant="outline">
            Back To Lobby
          </Button>
          <a className="btn btn-outline" href={slot.launchUrl} target="_blank" rel="noreferrer">
            Open In New Tab
          </a>
        </div>
      </Card>

      <aside className="slot-page-side">
        <Card className="slot-facts-card">
          <h3>Slot Facts</h3>
          <div className="slot-facts-grid">
            <article>
              <span>Provider</span>
              <strong>{slot.provider}</strong>
            </article>
            <article>
              <span>Category</span>
              <strong>{slot.category}</strong>
            </article>
            <article>
              <span>Mode</span>
              <strong>{slot.mode}</strong>
            </article>
            <article>
              <span>Volatility</span>
              <strong>{slot.volatility}</strong>
            </article>
          </div>
        </Card>

        <Card className="slot-faq-card">
          <h3>Slot FAQ</h3>
          <div className="slot-faq-list">
            {slot.faq.map((item) => (
              <article key={item.q}>
                <h4>{item.q}</h4>
                <p>{item.a}</p>
              </article>
            ))}
          </div>
        </Card>
      </aside>
    </section>
  );
}

export default SlotGamePage;
