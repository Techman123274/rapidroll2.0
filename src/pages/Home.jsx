import Carousel from '../components/ui/Carousel';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import GameCard from '../components/game/GameCard';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { gameList, isImplementedGame, slugify } from '../data/gameCatalog';

const promotions = [
  {
    title: 'Welcome Offer',
    description: 'Claim your first reward pack when you register.',
    image: 'https://picsum.photos/seed/promo-welcome/640/360',
    ctaPath: '/wallet',
    ctaLabel: 'Open Wallet'
  },
  {
    title: 'Weekly Cashback',
    description: 'Get a percentage of your weekly play back as credits.',
    image: 'https://picsum.photos/seed/promo-cashback/640/360',
    ctaPath: '/daily',
    ctaLabel: 'Claim Daily'
  },
  {
    title: 'Leaderboard Race',
    description: 'Compete in weekly rankings and unlock prize pools.',
    image: 'https://picsum.photos/seed/promo-leaderboard/640/360',
    ctaPath: '/vip',
    ctaLabel: 'Enter VIP'
  }
];

function Home() {
  const { user, isDailyAvailable } = useAuth();
  const { games: managedGames, isSiteOnline } = useAdmin();

  const getDisabledState = (title) => {
    if (!isSiteOnline) return true;
    if (!isImplementedGame(title)) return true;
    const gameState = managedGames.find((game) => game.slug === slugify(title));
    return gameState ? !gameState.enabled : false;
  };

  const originals = gameList.filter((game) => game.tag === 'Originals');
  const slots = gameList.filter((game) => game.tag === 'Slots');
  const tableGames = gameList.filter((game) => game.tag === 'Table' || game.tag === 'Live' || game.tag === 'Cards');

  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="hero-content">
          <span className="eyebrow">Rapid Rolls 2.0</span>
          <h1>Play Smarter. Faster. Cleaner.</h1>
          <p>
            A modern casino lobby with fast navigation, one-tap wallet controls,
            and daily rewards available right after login.
          </p>
          <div className="hero-actions">
            <Button as="link" to={user ? '/games' : '/register'}>
              {user ? 'Go To Games' : 'Start Playing'}
            </Button>
            <Button as="link" to={user ? '/wallet' : '/promotions'} variant="outline">
              {user ? 'Open Wallet' : 'View Promotions'}
            </Button>
          </div>
        </div>
        <div className="hero-media-wrap">
          <img
            className="hero-media"
            src="https://picsum.photos/seed/rapid-hero/900/560"
            alt="Rapid Rolls lobby preview"
          />
        </div>
      </section>

      {/* ACCOUNT SNAPSHOT */}
      {user && (
        <section className="page-section">
          <h2 className="section-title">Account Snapshot</h2>
          <div className="wallet-grid">
            <Card>
              <h3>Account</h3>
              <p className="wallet-value">Active</p>
            </Card>
            <Card>
              <h3>VIP Tier</h3>
              <p className="wallet-value">{user.vipTier}</p>
            </Card>
            <Card>
              <h3>Daily Bonus</h3>
              <p className="wallet-value">{isDailyAvailable ? 'Ready to claim' : 'Claimed today'}</p>
            </Card>
          </div>
        </section>
      )}

      {/* ORIGINALS */}
      <Carousel title="Originals">
        {originals.map((game) => (
          <GameCard
            key={game.title}
            title={game.title}
            image={game.image}
            tag={game.tag}
            minimal
            disabled={getDisabledState(game.title)}
          />
        ))}
      </Carousel>

      {/* SLOTS */}
      <Carousel title="Slots">
        {slots.map((game) => (
          <GameCard
            key={game.title}
            title={game.title}
            image={game.image}
            tag={game.tag}
            minimal
            disabled={getDisabledState(game.title)}
          />
        ))}
      </Carousel>

      {user ? (
        <>
          {/* TABLE GAMES */}
          <Carousel title="Table & Live">
            {tableGames.map((game) => (
              <GameCard
                key={game.title}
                title={game.title}
                image={game.image}
                tag={game.tag}
                minimal
                disabled={getDisabledState(game.title)}
              />
            ))}
          </Carousel>

          {/* LOGGED-IN ACTIONS */}
          <section className="page-section">
            <h2 className="section-title">Today In Rapid Rolls</h2>
            <div className="steps-grid">
              <Card className="step-card">
                <h3>Daily Status</h3>
                <p>{isDailyAvailable ? 'Daily bonus is ready to claim.' : 'Daily bonus already claimed today.'}</p>
              </Card>
              <Card className="step-card">
                <h3>VIP Progress</h3>
                <p>Track level progress and rewards in the VIP Lounge.</p>
              </Card>
              <Card className="step-card">
                <h3>Wallet</h3>
                <p>Manage deposits and withdrawals from the wallet page.</p>
              </Card>
              <Card className="step-card">
                <h3>Admin Alerts</h3>
                <p>See live notifications posted by staff under the header.</p>
              </Card>
            </div>
          </section>
        </>
      ) : (
        <>
          {/* PROMOTIONS */}
          <section className="page-section">
            <h2 className="section-title">Promotions</h2>
            <div className="promo-grid">
              {promotions.map((promo) => (
                <Card className="promo-card" key={promo.title}>
                  <img className="media-image" src={promo.image} alt={promo.title} loading="lazy" />
                  <h3>{promo.title}</h3>
                  <p>{promo.description}</p>
                  <Button as="link" to={promo.ctaPath}>
                    {promo.ctaLabel}
                  </Button>
                </Card>
              ))}
            </div>
          </section>

          {/* HOW TO */}
          <section className="page-section">
            <h2 className="section-title">How To Get Started</h2>
            <div className="steps-grid">
              <Card className="step-card">
                <span className="step-number">1</span>
                <h3>Create Account</h3>
                <p>Sign up and verify your profile in minutes.</p>
              </Card>
              <Card className="step-card">
                <span className="step-number">2</span>
                <h3>Deposit Funds</h3>
                <p>Use Wallet to instantly add balance.</p>
              </Card>
              <Card className="step-card">
                <span className="step-number">3</span>
                <h3>Claim Daily</h3>
                <p>Open Daily Bonus and claim once every day.</p>
              </Card>
              <Card className="step-card">
                <span className="step-number">4</span>
                <h3>Play & Win</h3>
                <p>Launch games and track tier progress in VIP.</p>
              </Card>
            </div>
          </section>
        </>
      )}
    </>
  );
}

export default Home;
