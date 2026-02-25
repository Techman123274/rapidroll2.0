import { useMemo, useState } from 'react';

const KEY = 'rapidroll_favorites_v1';

const load = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
};

export function useFavorites() {
  const [favorites, setFavorites] = useState(load);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const toggleFavorite = (slug) => {
    setFavorites((prev) => {
      const value = String(slug || '');
      const exists = prev.includes(value);
      const next = exists ? prev.filter((item) => item !== value) : [value, ...prev].slice(0, 80);
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  };

  return {
    favorites,
    favoriteSet,
    toggleFavorite
  };
}
