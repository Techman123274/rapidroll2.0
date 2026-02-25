export const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

const imageFor = (title) => `/games/${slugify(title)}.svg`;

export const gameList = [
  { title: 'Dice Rush', image: imageFor('Dice Rush'), tag: 'Originals' },
  { title: 'Crash Zone', image: imageFor('Crash Zone'), tag: 'Originals' },
  { title: 'Mines Master', image: imageFor('Mines Master'), tag: 'Originals' },
  { title: 'Roulette Pro', image: imageFor('Roulette Pro'), tag: 'Table' },
  { title: 'Blackjack Live', image: imageFor('Blackjack Live'), tag: 'Live' },
  { title: 'BlackVault Blackjack', image: imageFor('BlackVault Blackjack'), tag: 'Table' },
  { title: 'Poker Arena', image: imageFor('Poker Arena'), tag: 'Cards' },
  { title: 'Mole Digger Slots', image: imageFor('Mole Digger Slots'), tag: 'Slots' },
  { title: 'Rise of Olympus 1000', image: imageFor('Rise of Olympus 1000'), tag: 'Slots' },
  { title: 'Fangs and Fire', image: imageFor('Fangs and Fire'), tag: 'Slots' },
  { title: 'Lawnnd Isorder', image: imageFor('Lawnnd Isorder'), tag: 'Slots' },
  { title: 'Hotdog Heist', image: imageFor('Hotdog Heist'), tag: 'Slots' },
  { title: 'Bonanza Down Under', image: imageFor('Bonanza Down Under'), tag: 'Slots' },
  { title: 'Slot Storm', image: imageFor('Slot Storm'), tag: 'Slots' },
  { title: 'Keno Blast', image: imageFor('Keno Blast'), tag: 'Quick' },
  { title: 'Limbo Vault', image: imageFor('Limbo Vault'), tag: 'Originals' },
  { title: 'Plinko Drop', image: imageFor('Plinko Drop'), tag: 'Originals' },
  { title: 'Towers X', image: imageFor('Towers X'), tag: 'Originals' },
  { title: 'Book Of Gold', image: imageFor('Book Of Gold'), tag: 'Slots' },
  { title: 'Neon Reels', image: imageFor('Neon Reels'), tag: 'Slots' },
  { title: 'Dragon Spins', image: imageFor('Dragon Spins'), tag: 'Slots' }
];

export const implementedGameSlugs = new Set([
  'dice-rush',
  'crash-zone',
  'mines-master',
  'roulette-pro',
  'blackjack-live',
  'blackvault-blackjack',
  'mole-digger-slots',
  'rise-of-olympus-1000',
  'fangs-and-fire',
  'lawnnd-isorder',
  'hotdog-heist',
  'bonanza-down-under',
  'limbo-vault',
  'plinko-drop',
  'towers-x'
]);

export const isImplementedGame = (value) => implementedGameSlugs.has(slugify(value));
