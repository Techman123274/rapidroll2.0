import { useMemo } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useAdmin } from '../../context/AdminContext';
import { useAuth } from '../../context/AuthContext';
import {
  gameCatalog,
  getFeaturedGames,
  getProviders,
  getGamesByCategory,
  isImplementedGame
} from '../../data/gameCatalog';
import { useFavorites } from './hooks/useFavorites';
import { useRecentlyPlayed } from './hooks/useRecentlyPlayed';
import { useLobbyFilters } from './hooks/useLobbyFilters';
import LobbySection from './components/LobbySection';
import RecentlyPlayedRow from './components/RecentlyPlayedRow';

const categoryTabs = [
  { id: 'all', label: 'All' },
  { id: 'originals', label: 'Originals' },
  { id: 'slots', label: 'Slots' },
  { id: 'table', label: 'Table Games' }
];

function LobbyPage({ title = 'Casino Lobby', subtitle = 'Browse games by category, provider, and tags.', showHero = true }) {
  const { user } = useAuth();
  const { games: managedGames, promotions, isSiteOnline } = useAdmin();
  const { favorites, favoriteSet, toggleFavorite } = useFavorites();
  const { recent, markPlayed } = useRecentlyPlayed();

  const providers = useMemo(() => getProviders(gameCatalog), []);

  const isDisabled = (game) => {
    if (!isSiteOnline) return true;
    if (!isImplementedGame(game.slug)) return true;
    const gameState = managedGames.find((row) => row.slug === game.slug);
    return gameState ? !gameState.enabled : false;
  };

  const {
    search,
    setSearch,
    category,
    setCategory,
    provider,
    setProvider,
    tag,
    setTag,
    sort,
    setSort,
    mobileFiltersOpen,
    setMobileFiltersOpen,
    filteredGames
  } = useLobbyFilters(gameCatalog, favorites);

  const counts = useMemo(
    () => ({
      all: filteredGames.length,
      originals: filteredGames.filter((row) => row.category === 'originals').length,
      slots: filteredGames.filter((row) => row.category === 'slots').length,
      table: filteredGames.filter((row) => row.category === 'table').length
    }),
    [filteredGames]
  );

  const featured = useMemo(() => getFeaturedGames(gameCatalog, 4), []);
  const starterPromotions = useMemo(
    () => [
      {
        id: 'starter-welcome-pack',
        title: 'Starter Welcome Pack',
        description: 'Claim your starting bonus credits and open your first challenge set.'
      },
      {
        id: 'daily-boost-x2',
        title: 'Daily Boost x2',
        description: 'Double daily claim value for active sessions during this launch window.'
      },
      {
        id: 'weekend-race-event',
        title: 'Weekend Race Event',
        description: 'Climb leaderboard rankings this weekend for extra bonus rewards.'
      }
    ],
    []
  );
  const promoCards = (promotions || []).length ? (promotions || []).slice(0, 3) : starterPromotions;

  const recentlyPlayedGames = useMemo(() => {
    const bySlug = new Map(gameCatalog.map((game) => [game.slug, game]));
    return recent.map((slug) => bySlug.get(slug)).filter(Boolean);
  }, [recent]);

  const listForCategory = (categoryKey) => {
    if (category === 'all') return getGamesByCategory(categoryKey, filteredGames);
    return category === categoryKey ? getGamesByCategory(categoryKey, filteredGames) : [];
  };

  const hasResults = filteredGames.length > 0;

  return (
    <section className="page-section lobby-page">
      <header className="page-header">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </header>

      <Card className="lobby-topbar">
        <label className="lobby-search" htmlFor="lobby-search-input">
          Search
          <input
            id="lobby-search-input"
            type="text"
            placeholder="Search game or provider"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="lobby-top-shortcuts" role="tablist" aria-label="Category shortcuts">
          {categoryTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`lobby-shortcut ${category === item.id ? 'is-active' : ''}`}
              onClick={() => setCategory(item.id)}
            >
              {item.label} ({counts[item.id] ?? 0})
            </button>
          ))}
        </div>

        <div className="lobby-top-right">
          <span className="lobby-balance">Balance: ${Number(user?.balance || 0).toFixed(2)}</span>
          <button type="button" className="btn btn-outline" onClick={() => setMobileFiltersOpen((prev) => !prev)}>
            Filters
          </button>
        </div>
      </Card>

      <Card className={`lobby-filters-bar ${mobileFiltersOpen ? 'is-open' : ''}`}>
          <label>
            Provider
            <select value={provider} onChange={(event) => setProvider(event.target.value)}>
              {providers.map((item) => (
                <option key={item} value={item}>
                  {item === 'all' ? 'All Providers' : item}
                </option>
              ))}
            </select>
          </label>

          <label>
            Tag
            <select value={tag} onChange={(event) => setTag(event.target.value)}>
              <option value="all">All Tags</option>
              <option value="favorites">Favorites</option>
              <option value="new">New</option>
              <option value="popular">Popular</option>
            </select>
          </label>

          <label>
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="featured">Featured</option>
              <option value="a-z">A-Z</option>
              <option value="popular">Popular</option>
              <option value="new">Newest</option>
              <option value="provider">Provider</option>
            </select>
          </label>
      </Card>

      {showHero && (
        <section className="lobby-hero-grid">
          <Card className="lobby-featured-card">
            <h2>Featured Games</h2>
            <div className="lobby-featured-grid">
              {featured.map((game) => (
                <Button key={game.id} as="link" to={game.route} variant="outline" onClick={() => markPlayed(game.slug)}>
                  {game.name}
                </Button>
              ))}
            </div>
          </Card>

          <Card className="lobby-featured-card">
            <h2>Starting Promotions</h2>
            <div className="lobby-promo-mini-list">
              {promoCards.map((promo) => (
                <article key={promo._id || promo.id}>
                  <strong>{promo.title}</strong>
                  <p>{promo.description}</p>
                </article>
              ))}
            </div>
          </Card>
        </section>
      )}

      <RecentlyPlayedRow games={recentlyPlayedGames} />

      {hasResults ? (
        <>
          <LobbySection
            title="Originals"
            subtitle={`${counts.originals} games`}
            games={listForCategory('originals')}
            isDisabled={isDisabled}
            favoriteSet={favoriteSet}
            onFavorite={toggleFavorite}
            onPlay={markPlayed}
          />
          <LobbySection
            title="Slots"
            subtitle={`${counts.slots} games`}
            games={listForCategory('slots')}
            isDisabled={isDisabled}
            favoriteSet={favoriteSet}
            onFavorite={toggleFavorite}
            onPlay={markPlayed}
          />
          <LobbySection
            title="Table Games"
            subtitle={`${counts.table} games`}
            games={listForCategory('table')}
            isDisabled={isDisabled}
            favoriteSet={favoriteSet}
            onFavorite={toggleFavorite}
            onPlay={markPlayed}
          />
        </>
      ) : (
        <Card className="lobby-empty-state">
          <h3>No games found</h3>
          <p>Try a different search or clear your filters.</p>
          <Button
            variant="outline"
            onClick={() => {
              setSearch('');
              setCategory('all');
              setProvider('all');
              setTag('all');
              setSort('featured');
            }}
          >
            Clear Filters
          </Button>
        </Card>
      )}
    </section>
  );
}

export default LobbyPage;
