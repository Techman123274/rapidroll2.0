import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/ui/Card';
import { useAuth } from '../context/AuthContext';
import { gameCatalog, getFeaturedGames, getHomeCategoryPreviews, searchGames } from '../data/gameCatalog';
import CategoryHubCard from '../features/lobby/components/CategoryHubCard';
import RecentlyPlayedRow from '../features/lobby/components/RecentlyPlayedRow';
import { useRecentlyPlayed } from '../features/lobby/hooks/useRecentlyPlayed';

function Home() {
  const { user } = useAuth();
  const { recent } = useRecentlyPlayed();
  const [search, setSearch] = useState('');

  const categoryPanels = useMemo(() => getHomeCategoryPreviews(), []);
  const featured = useMemo(() => getFeaturedGames(undefined, 6), []);
  const searchResults = useMemo(() => searchGames(search).slice(0, 8), [search]);

  const recentRows = useMemo(() => {
    const bySlug = new Map(gameCatalog.map((row) => [row.slug, row]));
    return recent.map((slug) => bySlug.get(slug)).filter(Boolean);
  }, [recent]);

  return (
    <section className="page-section lobby-page">
      <header className="page-header">
        <h1>RapidRoll Dashboard</h1>
        <p>Choose a category to browse cleanly separated game libraries.</p>
      </header>

      <Card className="lobby-topbar">
        <label className="lobby-search" htmlFor="home-search">
          Search Games
          <input
            id="home-search"
            type="text"
            value={search}
            placeholder="Search all games"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="lobby-top-shortcuts">
          <Link className="lobby-shortcut is-active" to="/originals">
            Originals
          </Link>
          <Link className="lobby-shortcut" to="/slots">
            Slots
          </Link>
          <Link className="lobby-shortcut" to="/table-games">
            Table Games
          </Link>
        </div>

        <div className="lobby-top-right">
          <span className="lobby-balance">Balance: ${Number(user?.balance || 0).toFixed(2)}</span>
        </div>
      </Card>

      <section className="lobby-hero-grid">
        <Card className="lobby-featured-card">
          <h2>Featured Now</h2>
          <div className="lobby-featured-grid">
            {featured.map((game) => (
              <Link key={game.id} className="btn btn-outline" to={game.route}>
                {game.name}
              </Link>
            ))}
          </div>
        </Card>

        <Card className="lobby-featured-card">
          <h2>Starting Promos</h2>
          <div className="lobby-promo-mini-list">
            <article>
              <strong>Starter Welcome Pack</strong>
              <p>Claim bonus demo credits and unlock your first challenge rewards.</p>
            </article>
            <article>
              <strong>Daily Boost x2</strong>
              <p>Double claim value available in your daily bonus panel.</p>
            </article>
            <article>
              <strong>Weekend Race Event</strong>
              <p>Compete in leaderboard activity for bonus event rewards.</p>
            </article>
          </div>
        </Card>
      </section>

      {search.trim() ? (
        <section className="lobby-section">
          <header className="lobby-section-head">
            <div>
              <h2>Search Results</h2>
              <p>{searchResults.length} games found</p>
            </div>
          </header>
          <div className="lobby-grid">
            {searchResults.map((game) => (
              <CategoryHubCard
                key={game.id}
                section={{
                  id: game.slug,
                  title: game.name,
                  count: 1,
                  description: `${game.provider} • ${game.category}`,
                  previews: [game],
                  route: game.route
                }}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="category-hub-grid">
          {categoryPanels.map((section) => (
            <CategoryHubCard key={section.id} section={section} />
          ))}
        </section>
      )}

      <RecentlyPlayedRow games={recentRows} />
    </section>
  );
}

export default Home;
