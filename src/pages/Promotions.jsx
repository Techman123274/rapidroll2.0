import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';

function Promotions() {
  const { user } = useAuth();
  const { promotions } = useAdmin();

  return (
    <section className="page-section promotions-page">
      {/* FEATURED PROMO */}
      <Card className="promo-featured">
        <div className="promo-featured-content">
          <span className="eyebrow">Featured Campaign</span>
          <h1>Daily Drops & Weekly Races</h1>
          <p>
            Stake-inspired promo lobby: claim daily rewards, compete in leaderboards,
            and unlock reloads directly from your wallet.
          </p>
          <div className="wallet-actions">
            <Button as="link" to={user ? '/daily' : '/login'}>
              {user ? 'Claim Daily Bonus' : 'Login to Claim'}
            </Button>
            <Button as="link" to={user ? '/wallet' : '/login'} variant="outline">
              {user ? 'Open Wallet' : 'Sign In'}
            </Button>
          </div>
        </div>
        <img
          className="promo-featured-media"
          src="https://picsum.photos/seed/promotions-featured/900/520"
          alt="Featured promotions"
          loading="lazy"
        />
      </Card>

      {/* PROMO FILTERS */}
      <div className="promo-filters" role="tablist" aria-label="Promotion categories">
        <button className="promo-filter is-active" type="button">All</button>
        <button className="promo-filter" type="button">Casino</button>
        <button className="promo-filter" type="button">Sports</button>
        <button className="promo-filter" type="button">VIP</button>
      </div>

      {/* PROMOTION GRID */}
      <div className="promo-grid promo-grid-stake">
        {promotions.map((promo) => (
          <Card className="promo-card promo-card-stake" key={promo._id || promo.id}>
            <div className="promo-media-wrap">
              <img className="media-image" src={promo.image} alt={promo.title} loading="lazy" />
              <span className="promo-badge">{promo.badge}</span>
            </div>
            <h3>{promo.title}</h3>
            {(Number(promo.amount || 0) > 0 || Number(promo.usesRemaining || promo.uses || 0) > 0) && (
              <p className="promo-metrics">
                {Number(promo.amount || 0) > 0 ? `Amount: $${Number(promo.amount).toFixed(2)}` : 'Amount: --'}
                {' • '}
                Uses Left: {Number(promo.usesRemaining || promo.uses || 0)}
              </p>
            )}
            <p>{promo.description}</p>
            <Button as="link" to={user ? promo.path : '/login'}>
              {user ? promo.cta : 'Login to Claim'}
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default Promotions;
