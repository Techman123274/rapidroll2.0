import { useMemo, useState } from 'react';

const KEY = 'rapidroll_recent_played_v1';

const load = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
};

export function useRecentlyPlayed() {
  const [recent, setRecent] = useState(load);

  const recentSet = useMemo(() => new Set(recent), [recent]);

  const markPlayed = (slug) => {
    setRecent((prev) => {
      const value = String(slug || '');
      const next = [value, ...prev.filter((item) => item !== value)].slice(0, 20);
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  };

  return {
    recent,
    recentSet,
    markPlayed
  };
}
