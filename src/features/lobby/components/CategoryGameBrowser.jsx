import { useMemo, useState } from 'react';
import Card from '../../../components/ui/Card';
import { useAdmin } from '../../../context/AdminContext';
import { filterGames, getGamesByCategory, getProviders, isImplementedGame, sortGames } from '../../../data/gameCatalog';
import { useFavorites } from '../hooks/useFavorites';
import { useRecentlyPlayed } from '../hooks/useRecentlyPlayed';
import LobbyGameCard from './LobbyGameCard';

function CategoryGameBrowser({
  title,
  subtitle,
  category,
  showProviderFilter = false,
  defaultSort = 'featured'
}) {
  const { games: managedGames, isSiteOnline } = useAdmin();
  const { favoriteSet, favorites, toggleFavorite } = useFavorites();
  const { markPlayed } = useRecentlyPlayed();

  const baseGames = useMemo(() => getGamesByCategory(category), [category]);
  const providers = useMemo(() => getProviders(baseGames), [baseGames]);

  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('all');
  const [tag, setTag] = useState('all');
  const [sort, setSort] = useState(defaultSort);

  const isDisabled = (game) => {
    if (!isSiteOnline) return true;
    if (!isImplementedGame(game.slug)) return true;
    const gameState = managedGames.find((row) => row.slug === game.slug);
    return gameState ? !gameState.enabled : false;
  };

  const filtered = useMemo(() => {
    const rows = filterGames({
      games: baseGames,
      search,
      category,
      provider,
      tag,
      favorites
    });
    return sortGames(rows, sort);
  }, [baseGames, search, category, provider, tag, favorites, sort]);

  return (
    <section className="page-section lobby-page">
      <header className="page-header">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </header>

      <Card className="lobby-filters-bar is-open">
        <label>
          Search
          <input type="text" placeholder={`Search ${title}`} value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>

        {showProviderFilter ? (
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
        ) : (
          <label>
            Tag
            <select value={tag} onChange={(event) => setTag(event.target.value)}>
              <option value="all">All Tags</option>
              <option value="new">New</option>
              <option value="popular">Popular</option>
              <option value="favorites">Favorites</option>
            </select>
          </label>
        )}

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

      {filtered.length > 0 ? (
        <div className="lobby-grid" role="list">
          {filtered.map((game) => (
            <LobbyGameCard
              key={game.id}
              game={game}
              disabled={isDisabled(game)}
              isFavorite={favoriteSet.has(game.slug)}
              onFavorite={(event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleFavorite(game.slug);
              }}
              onPlay={() => markPlayed(game.slug)}
            />
          ))}
        </div>
      ) : (
        <Card className="lobby-empty-state">
          <h3>No games found</h3>
          <p>Try changing search/filter options.</p>
        </Card>
      )}
    </section>
  );
}

export default CategoryGameBrowser;
