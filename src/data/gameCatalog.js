export const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

const localImage = (name) => `/games/${slugify(name)}.svg`;
const slotProviderImage = (slug) => `/api/slots/image/${slug}`;

export const gameCatalog = [
  {
    id: 'g-dice-rush',
    slug: 'dice-rush',
    name: 'Dice Rush',
    category: 'originals',
    subcategory: 'dice',
    provider: 'RapidRoll',
    imageUrl: localImage('Dice Rush'),
    route: '/games/dice-rush',
    isNew: false,
    isPopular: true,
    isFeatured: true,
    isEnabled: true,
    supportsMobile: true,
    tags: ['popular', 'fast'],
    sortPriority: 15
  },
  {
    id: 'g-crash-zone',
    slug: 'crash-zone',
    name: 'Crash Zone',
    category: 'originals',
    subcategory: 'crash',
    provider: 'RapidRoll',
    imageUrl: localImage('Crash Zone'),
    route: '/games/crash-zone',
    isNew: false,
    isPopular: true,
    isFeatured: true,
    isEnabled: true,
    supportsMobile: true,
    tags: ['hot', 'popular'],
    sortPriority: 14
  },
  {
    id: 'g-mines-master',
    slug: 'mines-master',
    name: 'Mines Master',
    category: 'originals',
    subcategory: 'mines',
    provider: 'RapidRoll',
    imageUrl: localImage('Mines Master'),
    route: '/games/mines-master',
    isNew: false,
    isPopular: true,
    isFeatured: true,
    isEnabled: true,
    supportsMobile: true,
    tags: ['popular'],
    sortPriority: 16
  },
  {
    id: 'g-limbo-vault',
    slug: 'limbo-vault',
    name: 'Limbo Vault',
    category: 'originals',
    subcategory: 'limbo',
    provider: 'RapidRoll',
    imageUrl: localImage('Limbo Vault'),
    route: '/games/limbo-vault',
    isNew: true,
    isPopular: false,
    isFeatured: false,
    isEnabled: true,
    supportsMobile: true,
    tags: ['new'],
    sortPriority: 8
  },
  {
    id: 'g-plinko-drop',
    slug: 'plinko-drop',
    name: 'Plinko Drop',
    category: 'originals',
    subcategory: 'plinko',
    provider: 'RapidRoll',
    imageUrl: localImage('Plinko Drop'),
    route: '/games/plinko-drop',
    isNew: true,
    isPopular: true,
    isFeatured: true,
    isEnabled: true,
    supportsMobile: true,
    tags: ['new', 'hot'],
    sortPriority: 13
  },
  {
    id: 'g-towers-x',
    slug: 'towers-x',
    name: 'Towers X',
    category: 'originals',
    subcategory: 'towers',
    provider: 'RapidRoll',
    imageUrl: localImage('Towers X'),
    route: '/games/towers-x',
    isNew: true,
    isPopular: false,
    isFeatured: false,
    isEnabled: true,
    supportsMobile: true,
    tags: ['new'],
    sortPriority: 7
  },
  {
    id: 'g-keno-blast',
    slug: 'keno-blast',
    name: 'Keno Blast',
    category: 'originals',
    subcategory: 'keno',
    provider: 'RapidRoll',
    imageUrl: localImage('Keno Blast'),
    route: '/games/keno-blast',
    isNew: false,
    isPopular: false,
    isFeatured: false,
    isEnabled: true,
    supportsMobile: true,
    tags: ['quick'],
    sortPriority: 5
  },
  {
    id: 'g-roulette-pro',
    slug: 'roulette-pro',
    name: 'Roulette Pro',
    category: 'table-games',
    subcategory: 'roulette',
    provider: 'RapidRoll',
    imageUrl: localImage('Roulette Pro'),
    route: '/games/roulette-pro',
    isNew: false,
    isPopular: true,
    isFeatured: true,
    isEnabled: true,
    supportsMobile: true,
    tags: ['popular', 'table'],
    sortPriority: 12
  },
  {
    id: 'g-blackjack-live',
    slug: 'blackjack-live',
    name: 'Blackjack Live',
    category: 'table-games',
    subcategory: 'blackjack',
    provider: 'RapidRoll',
    imageUrl: localImage('Blackjack Live'),
    route: '/games/blackjack-live',
    isNew: false,
    isPopular: true,
    isFeatured: false,
    isEnabled: true,
    supportsMobile: true,
    tags: ['table'],
    sortPriority: 9
  },
  {
    id: 'g-blackvault-blackjack',
    slug: 'blackvault-blackjack',
    name: 'BlackVault Blackjack',
    category: 'table-games',
    subcategory: 'blackjack',
    provider: 'RapidRoll',
    imageUrl: localImage('BlackVault Blackjack'),
    route: '/games/blackvault-blackjack',
    isNew: true,
    isPopular: false,
    isFeatured: false,
    isEnabled: true,
    supportsMobile: true,
    tags: ['new', 'table'],
    sortPriority: 6
  },
  {
    id: 'g-poker-arena',
    slug: 'poker-arena',
    name: 'Poker Arena',
    category: 'table-games',
    subcategory: 'poker',
    provider: 'RapidRoll',
    imageUrl: localImage('Poker Arena'),
    route: '/games/poker-arena',
    isNew: true,
    isPopular: false,
    isFeatured: true,
    isEnabled: true,
    supportsMobile: true,
    tags: ['new', 'table'],
    sortPriority: 11
  },
  {
    id: 'g-mole-digger-slots',
    slug: 'mole-digger-slots',
    name: 'Mole Digger Slots',
    category: 'slots',
    subcategory: 'video-slot',
    provider: "Play'n GO",
    imageUrl: slotProviderImage('mole-digger-slots'),
    route: '/games/mole-digger-slots',
    isNew: false,
    isPopular: true,
    isFeatured: true,
    isEnabled: true,
    supportsMobile: true,
    tags: ['provider-playngo', 'slots'],
    sortPriority: 10
  },
  {
    id: 'g-rise-of-olympus-1000',
    slug: 'rise-of-olympus-1000',
    name: 'Rise of Olympus 1000',
    category: 'slots',
    subcategory: 'video-slot',
    provider: "Play'n GO",
    imageUrl: slotProviderImage('rise-of-olympus-1000'),
    route: '/games/rise-of-olympus-1000',
    isNew: false,
    isPopular: true,
    isFeatured: true,
    isEnabled: true,
    supportsMobile: true,
    tags: ['provider-playngo', 'slots', 'hot'],
    sortPriority: 18
  },
  {
    id: 'g-fangs-and-fire',
    slug: 'fangs-and-fire',
    name: 'Fangs and Fire',
    category: 'slots',
    subcategory: 'video-slot',
    provider: "Play'n GO",
    imageUrl: slotProviderImage('fangs-and-fire'),
    route: '/games/fangs-and-fire',
    isNew: false,
    isPopular: false,
    isFeatured: false,
    isEnabled: true,
    supportsMobile: true,
    tags: ['provider-playngo', 'slots'],
    sortPriority: 4
  },
  {
    id: 'g-lawnnd-isorder',
    slug: 'lawnnd-isorder',
    name: 'Lawnnd Isorder',
    category: 'slots',
    subcategory: 'video-slot',
    provider: "Play'n GO",
    imageUrl: slotProviderImage('lawnnd-isorder'),
    route: '/games/lawnnd-isorder',
    isNew: false,
    isPopular: false,
    isFeatured: false,
    isEnabled: true,
    supportsMobile: true,
    tags: ['provider-playngo', 'slots'],
    sortPriority: 3
  },
  {
    id: 'g-hotdog-heist',
    slug: 'hotdog-heist',
    name: 'Hotdog Heist',
    category: 'slots',
    subcategory: 'video-slot',
    provider: "Play'n GO",
    imageUrl: slotProviderImage('hotdog-heist'),
    route: '/games/hotdog-heist',
    isNew: false,
    isPopular: false,
    isFeatured: false,
    isEnabled: true,
    supportsMobile: true,
    tags: ['provider-playngo', 'slots'],
    sortPriority: 2
  },
  {
    id: 'g-bonanza-down-under',
    slug: 'bonanza-down-under',
    name: 'Bonanza Down Under',
    category: 'slots',
    subcategory: 'video-slot',
    provider: "Play'n GO",
    imageUrl: slotProviderImage('bonanza-down-under'),
    route: '/games/bonanza-down-under',
    isNew: false,
    isPopular: true,
    isFeatured: true,
    isEnabled: true,
    supportsMobile: true,
    tags: ['provider-playngo', 'slots'],
    sortPriority: 17
  },
  {
    id: 'g-slot-storm',
    slug: 'slot-storm',
    name: 'Slot Storm',
    category: 'slots',
    subcategory: 'video-slot',
    provider: 'RapidRoll',
    imageUrl: localImage('Slot Storm'),
    route: '/games/slot-storm',
    isNew: false,
    isPopular: false,
    isFeatured: false,
    isEnabled: false,
    supportsMobile: true,
    tags: ['slots'],
    sortPriority: 1
  },
  {
    id: 'g-book-of-gold',
    slug: 'book-of-gold',
    name: 'Book Of Gold',
    category: 'slots',
    subcategory: 'video-slot',
    provider: 'RapidRoll',
    imageUrl: localImage('Book Of Gold'),
    route: '/games/book-of-gold',
    isNew: true,
    isPopular: false,
    isFeatured: false,
    isEnabled: false,
    supportsMobile: true,
    tags: ['new', 'slots'],
    sortPriority: 1
  },
  {
    id: 'g-neon-reels',
    slug: 'neon-reels',
    name: 'Neon Reels',
    category: 'slots',
    subcategory: 'video-slot',
    provider: 'RapidRoll',
    imageUrl: localImage('Neon Reels'),
    route: '/games/neon-reels',
    isNew: true,
    isPopular: false,
    isFeatured: false,
    isEnabled: false,
    supportsMobile: true,
    tags: ['new', 'slots'],
    sortPriority: 1
  },
  {
    id: 'g-dragon-spins',
    slug: 'dragon-spins',
    name: 'Dragon Spins',
    category: 'slots',
    subcategory: 'video-slot',
    provider: 'RapidRoll',
    imageUrl: localImage('Dragon Spins'),
    route: '/games/dragon-spins',
    isNew: true,
    isPopular: false,
    isFeatured: false,
    isEnabled: false,
    supportsMobile: true,
    tags: ['new', 'slots'],
    sortPriority: 1
  }
];

const categoryTag = {
  originals: 'Originals',
  slots: 'Slots',
  'table-games': 'Table Games'
};

export const getAllGames = () => [...gameCatalog];

export const getGameBySlug = (slug) => gameCatalog.find((game) => game.slug === String(slug || '').toLowerCase()) || null;

export const getGamesByCategory = (category, games = gameCatalog) => {
  if (!category || category === 'all') return [...games];
  return games.filter((game) => game.category === category);
};

export const getFeaturedGames = (games = gameCatalog, limit = 6) =>
  games.filter((game) => game.isFeatured).sort((a, b) => b.sortPriority - a.sortPriority).slice(0, limit);

export const getProviders = (games = gameCatalog) => ['all', ...new Set(games.map((game) => game.provider))];

export const searchGames = (query = '', category = 'all', games = gameCatalog) => {
  const value = String(query || '').trim().toLowerCase();
  const base = category === 'all' ? games : games.filter((game) => game.category === category);
  if (!value) return base;
  return base.filter(
    (game) =>
      game.name.toLowerCase().includes(value) ||
      game.provider.toLowerCase().includes(value) ||
      game.slug.toLowerCase().includes(value) ||
      game.tags.some((tag) => String(tag).toLowerCase().includes(value))
  );
};

export const getHomeCategoryPreviews = (games = gameCatalog, previewCount = 4) => {
  const sections = [
    {
      id: 'originals',
      title: 'Originals',
      description: 'In-house fast games built for high-tempo sessions.',
      route: '/originals'
    },
    {
      id: 'slots',
      title: 'Slots',
      description: 'Image-first slot browsing with Play’n GO demo titles.',
      route: '/slots'
    },
    {
      id: 'table-games',
      title: 'Table Games',
      description: 'Classic cards and wheel games with clean controls.',
      route: '/table-games'
    }
  ];

  return sections.map((section) => {
    const rows = games.filter((game) => game.category === section.id);
    return {
      ...section,
      count: rows.length,
      previews: rows.slice(0, previewCount)
    };
  });
};

export const filterGames = ({
  games = gameCatalog,
  search = '',
  category = 'all',
  provider = 'all',
  tag = 'all',
  onlyMobile = false,
  favorites = []
}) => {
  const query = String(search || '').trim().toLowerCase();
  const favoriteSet = new Set((favorites || []).map((item) => String(item)));

  return games.filter((game) => {
    if (category !== 'all' && game.category !== category) return false;
    if (provider !== 'all' && game.provider !== provider) return false;
    if (onlyMobile && !game.supportsMobile) return false;
    if (tag === 'favorites' && !favoriteSet.has(game.slug)) return false;
    if (tag === 'new' && !game.isNew) return false;
    if (tag === 'popular' && !game.isPopular) return false;

    if (!query) return true;
    return (
      game.name.toLowerCase().includes(query) ||
      game.provider.toLowerCase().includes(query) ||
      game.category.toLowerCase().includes(query) ||
      game.tags.some((entry) => entry.toLowerCase().includes(query))
    );
  });
};

export const sortGames = (games = [], sort = 'featured') => {
  const rows = [...games];
  if (sort === 'a-z') {
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }
  if (sort === 'popular') {
    return rows.sort((a, b) => Number(b.isPopular) - Number(a.isPopular) || b.sortPriority - a.sortPriority);
  }
  if (sort === 'new') {
    return rows.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.sortPriority - a.sortPriority);
  }
  if (sort === 'provider') {
    return rows.sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
  }
  return rows.sort(
    (a, b) =>
      Number(b.isFeatured) - Number(a.isFeatured) ||
      Number(b.isPopular) - Number(a.isPopular) ||
      b.sortPriority - a.sortPriority ||
      a.name.localeCompare(b.name)
  );
};

export const implementedGameSlugs = new Set(gameCatalog.filter((game) => game.isEnabled).map((game) => game.slug));

export const isImplementedGame = (value) => {
  const slug = String(value || '').includes(' ') ? slugify(value) : String(value || '').toLowerCase();
  return implementedGameSlugs.has(slug);
};

export const gameList = gameCatalog.map((game) => ({
  title: game.name,
  image: game.imageUrl,
  tag: categoryTag[game.category] || 'Game'
}));
