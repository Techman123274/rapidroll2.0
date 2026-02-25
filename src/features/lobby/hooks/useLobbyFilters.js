import { useMemo, useState } from 'react';
import { filterGames, sortGames } from '../../../data/gameCatalog';

export function useLobbyFilters(games, favorites) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [provider, setProvider] = useState('all');
  const [tag, setTag] = useState('all');
  const [sort, setSort] = useState('featured');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const filteredGames = useMemo(() => {
    const rows = filterGames({
      games,
      search,
      category,
      provider,
      tag,
      favorites
    });
    return sortGames(rows, sort);
  }, [games, search, category, provider, tag, favorites, sort]);

  return {
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
  };
}
