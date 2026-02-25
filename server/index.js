import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_URI_FALLBACK = process.env.MONGODB_URI_FALLBACK || 'mongodb://127.0.0.1:27017/rapid_rolls';
const DB_RETRY_MS = Number(process.env.DB_RETRY_MS || 10000);
const USE_MONGODB_FALLBACK = process.env.USE_MONGODB_FALLBACK === 'true' || NODE_ENV !== 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_insecure_secret_change_me';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || (NODE_ENV === 'production' ? '' : 'http://localhost:5173');
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const DEFAULT_LOCAL_ORIGINS =
  NODE_ENV === 'production'
    ? []
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = new Set([
  ...(CLIENT_ORIGIN ? [CLIENT_ORIGIN] : []),
  ...DEFAULT_LOCAL_ORIGINS,
  ...CLIENT_ORIGINS
]);
const ALLOW_LAN_ORIGINS = process.env.ALLOW_LAN_ORIGINS !== 'false';
const SERVE_STATIC = process.env.SERVE_STATIC !== 'false';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../dist');
let dbReady = false;
let servicesInitialized = false;
const slotImageCache = new Map();

const SLOT_IMAGE_SOURCES = {
  'mole-digger-slots':
    'https://released.playngonetwork.com/casino/ContainerLauncher?pid=2&gid=moledigger&lang=en_GB&practice=1&channel=desktop&demo=2',
  'rise-of-olympus-1000':
    'https://released.playngonetwork.com/casino/ContainerLauncher?pid=2&gid=riseofolympus1000&lang=en_GB&practice=1&channel=desktop&demo=2',
  'fangs-and-fire':
    'https://released.playngonetwork.com/casino/ContainerLauncher?pid=2&gid=fangsandfire&lang=en_GB&practice=1&channel=mobile&demo=2',
  'lawnnd-isorder':
    'https://released.playngonetwork.com/casino/ContainerLauncher?pid=2&gid=lawnnd.isorder&lang=en_GB&practice=1&channel=mobile&demo=2',
  'hotdog-heist':
    'https://released.playngonetwork.com/casino/ContainerLauncher?pid=2&gid=hotdogheist&lang=en_GB&practice=1&channel=mobile&demo=2',
  'bonanza-down-under':
    'https://asccw.playngonetwork.com/casino/ContainerLauncher?pid=2&gid=bonanzadownunder&lang=en_GB&practice=1&channel=mobile&demo=2'
};

const isPrivateLanHost = (host) => {
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  if (!ALLOW_LAN_ORIGINS) return false;
  try {
    const parsed = new URL(origin);
    return isPrivateLanHost(parsed.hostname);
  } catch {
    return false;
  }
};

const isPromotionActive = (promo, now = new Date()) => {
  if (!promo || promo.enabled === false) return false;
  const starts = promo.startAt ? new Date(promo.startAt) : null;
  const ends = promo.endAt ? new Date(promo.endAt) : null;
  if (starts && now < starts) return false;
  if (ends && now > ends) return false;
  return true;
};

const extractMetaImage = (html = '') => {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return '';
};

const refreshSlotImageInBackground = async (slug, launchUrl, fallback) => {
  try {
    const now = Date.now();
    const cacheRow = slotImageCache.get(slug);
    if (cacheRow?.refreshing) return;

    slotImageCache.set(slug, {
      url: cacheRow?.url || fallback,
      expiresAt: cacheRow?.expiresAt || 0,
      refreshing: true
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3200);
    const response = await fetch(launchUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'RapidRollsBot/1.0 (+slot-image-resolver)'
      }
    });
    clearTimeout(timeout);

    const html = await response.text();
    let imageUrl = extractMetaImage(html);
    if (!imageUrl) {
      const host = new URL(launchUrl).origin;
      imageUrl = `${host}/favicon.ico`;
    }
    if (imageUrl.startsWith('//')) imageUrl = `https:${imageUrl}`;
    if (imageUrl.startsWith('/')) imageUrl = `${new URL(launchUrl).origin}${imageUrl}`;

    slotImageCache.set(slug, {
      url: imageUrl || fallback,
      expiresAt: now + 1000 * 60 * 60 * 6,
      refreshing: false
    });
  } catch {
    const current = slotImageCache.get(slug);
    slotImageCache.set(slug, {
      url: current?.url || fallback,
      expiresAt: Date.now() + 1000 * 60 * 10,
      refreshing: false
    });
  }
};

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in environment.');
  process.exit(1);
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: false
  })
);
app.use(express.json());
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const elapsedMs = Date.now() - startedAt;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsedMs}ms)`);
  });
  next();
});

if (SERVE_STATIC && fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: NODE_ENV === 'production' ? '1h' : 0 }));
}

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['player', 'admin', 'owner'], default: 'player' },
    balance: { type: Number, default: 1250 },
    totalWagered: { type: Number, default: 0 },
    totalWon: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    vipTier: { type: String, default: 'Silver' },
    dailyReward: { type: Number, default: 10 },
    lastDailyClaimedAt: { type: Date, default: null },
    challengeClaims: [
      {
        challengeId: { type: String, required: true },
        claimedAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

const promotionSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    title: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String, required: true },
    path: { type: String, default: '/promotions' },
    cta: { type: String, default: 'Claim' },
    badge: { type: String, default: 'New' },
    amount: { type: Number, default: 0 },
    uses: { type: Number, default: 0 },
    usesRemaining: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true, index: true },
    startAt: { type: Date, default: null, index: true },
    endAt: { type: Date, default: null, index: true },
    audience: { type: String, enum: ['all', 'vip', 'new_users', 'inactive_users'], default: 'all' },
    rewardType: {
      type: String,
      enum: ['deposit_bonus', 'daily_boost', 'free_spins', 'cashback', 'challenge_boost', 'leaderboard_event', 'promo_code'],
      default: 'daily_boost'
    },
    rewardConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
    placement: { type: String, enum: ['lobby', 'promotions', 'game', 'vip'], default: 'promotions' },
    promoCode: { type: String, default: '' },
    notifyOnPublish: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    claims: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const messageSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ['global', 'admin'], required: true },
    user: { type: String, required: true },
    text: { type: String, required: true },
    guestId: { type: String, default: null, index: true }
  },
  { timestamps: true }
);

const gameSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    enabled: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

const auditLogSchema = new mongoose.Schema(
  {
    level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
    action: { type: String, required: true },
    actor: { type: String, default: 'system' },
    actorRole: { type: String, default: 'system' },
    target: { type: String, default: '' },
    meta: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

const crashRoundSchema = new mongoose.Schema(
  {
    roundId: { type: String, required: true, unique: true, index: true },
    crashPoint: { type: Number, required: true },
    hashedServerSeed: { type: String, required: true },
    serverSeed: { type: String, required: true },
    clientSeed: { type: String, required: true },
    nonce: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
);

const crashBetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    roundId: { type: String, required: true, index: true },
    betAmount: { type: Number, required: true },
    autoCashoutAt: { type: Number, default: null },
    cashoutAt: { type: Number, default: null },
    payout: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'won', 'lost', 'cancelled'], default: 'active' }
  },
  { timestamps: true }
);

const crashHistorySchema = new mongoose.Schema(
  {
    roundId: { type: String, required: true, index: true },
    crashPoint: { type: Number, required: true }
  },
  { timestamps: true }
);

const diceBetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    betAmount: { type: Number, required: true },
    target: { type: Number, required: true },
    mode: { type: String, enum: ['under', 'over'], required: true },
    roll: { type: Number, required: true },
    winChance: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    payout: { type: Number, required: true, default: 0 },
    profit: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['won', 'lost'], required: true },
    serverSeedHash: { type: String, required: true },
    serverSeed: { type: String, required: true },
    clientSeed: { type: String, required: true },
    nonce: { type: Number, required: true }
  },
  { timestamps: true }
);

diceBetSchema.index({ userId: 1, createdAt: -1 });
diceBetSchema.index({ createdAt: -1 });
diceBetSchema.index({ status: 1 });

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    game: { type: String, required: true },
    type: { type: String, enum: ['bet', 'payout', 'daily_claim', 'deposit', 'withdraw', 'challenge_reward'], required: true },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    meta: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ createdAt: -1 });

const dailyClaimSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    claimedAt: { type: Date, required: true, default: Date.now }
  },
  { timestamps: true }
);

dailyClaimSchema.index({ userId: 1, claimedAt: -1 });

const rouletteSpinSchema = new mongoose.Schema(
  {
    spinId: { type: String, required: true, unique: true, index: true },
    winningNumber: { type: Number, required: true },
    color: { type: String, enum: ['red', 'black', 'green'], required: true },
    hashedServerSeed: { type: String, required: true },
    serverSeed: { type: String, required: true },
    clientSeed: { type: String, required: true },
    nonce: { type: Number, required: true }
  },
  { timestamps: true }
);

const rouletteBetSlipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    spinId: { type: String, required: true, index: true },
    totalBetAmount: { type: Number, required: true },
    bets: [
      {
        type: { type: String, required: true },
        value: mongoose.Schema.Types.Mixed,
        amount: { type: Number, required: true }
      }
    ],
    totalPayout: { type: Number, required: true },
    totalProfit: { type: Number, required: true },
    status: { type: String, enum: ['won', 'lost', 'partial_win'], required: true }
  },
  { timestamps: true }
);

rouletteBetSlipSchema.index({ userId: 1, createdAt: -1 });
rouletteBetSlipSchema.index({ createdAt: -1 });

const pokerHandSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    betAmount: { type: Number, required: true },
    status: { type: String, enum: ['active', 'completed'], default: 'active', index: true },
    initialHand: [{ type: String, required: true }],
    finalHand: [{ type: String, default: [] }],
    deck: [{ type: String, required: true }],
    holds: [{ type: Boolean, default: false }],
    handRank: { type: String, default: '' },
    multiplier: { type: Number, default: 0 },
    payout: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    serverSeedHash: { type: String, required: true },
    serverSeed: { type: String, required: true },
    clientSeed: { type: String, required: true },
    nonce: { type: Number, required: true }
  },
  { timestamps: true }
);

pokerHandSchema.index({ userId: 1, createdAt: -1 });

const towersGameSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    betAmount: { type: Number, required: true },
    currentFloor: { type: Number, default: 0 },
    multiplier: { type: Number, default: 1 },
    mineColumns: [{ type: Number, required: true }],
    status: { type: String, enum: ['active', 'lost', 'won', 'cashed_out'], default: 'active', index: true },
    payout: { type: Number, default: 0 },
    serverSeedHash: { type: String, required: true },
    serverSeed: { type: String, required: true },
    clientSeed: { type: String, required: true },
    nonce: { type: Number, required: true }
  },
  { timestamps: true }
);

towersGameSchema.index({ userId: 1, createdAt: -1 });

const fairnessSeedSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    game: { type: String, required: true, index: true },
    serverSeed: { type: String, required: true },
    hashedServerSeed: { type: String, required: true },
    clientSeed: { type: String, required: true },
    startNonce: { type: Number, default: 0 },
    endNonce: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    rotatedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

const fairnessVerificationLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    game: { type: String, required: true, index: true },
    input: mongoose.Schema.Types.Mixed,
    result: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
const Promotion = mongoose.model('Promotion', promotionSchema);
const Message = mongoose.model('Message', messageSchema);
const Game = mongoose.model('Game', gameSchema);
const Setting = mongoose.model('Setting', settingSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);
const CrashRound = mongoose.model('CrashRound', crashRoundSchema);
const CrashBet = mongoose.model('CrashBet', crashBetSchema);
const CrashHistory = mongoose.model('CrashHistory', crashHistorySchema);
const DiceBet = mongoose.model('DiceBet', diceBetSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const DailyClaim = mongoose.model('DailyClaim', dailyClaimSchema);
const RouletteSpin = mongoose.model('RouletteSpin', rouletteSpinSchema);
const RouletteBetSlip = mongoose.model('RouletteBetSlip', rouletteBetSlipSchema);
const PokerHand = mongoose.model('PokerHand', pokerHandSchema);
const TowersGame = mongoose.model('TowersGame', towersGameSchema);
const FairnessSeedSession = mongoose.model('FairnessSeedSession', fairnessSeedSessionSchema);
const FairnessVerificationLog = mongoose.model('FairnessVerificationLog', fairnessVerificationLogSchema);

const audit = async ({ level = 'info', action, actor = 'system', actorRole = 'system', target = '', meta = {} }) => {
  try {
    await AuditLog.create({ level, action, actor, actorRole, target, meta });
  } catch (error) {
    console.error('Audit log write failed', error.message);
  }
};

const sanitizeUser = (userDoc) => ({
  id: String(userDoc._id),
  username: userDoc.username,
  email: userDoc.email,
  role: userDoc.role,
  balance: Number(userDoc.balance),
  totalWagered: Number(userDoc.totalWagered || 0),
  totalWon: Number(userDoc.totalWon || 0),
  currency: userDoc.currency,
  vipTier: userDoc.vipTier,
  dailyReward: Number(userDoc.dailyReward),
  lastDailyClaimedAt: userDoc.lastDailyClaimedAt
});

const makeToken = (userDoc) =>
  jwt.sign(
    {
      sub: String(userDoc._id),
      role: userDoc.role,
      username: userDoc.username
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

const isClaimedToday = (dateValue) => {
  if (!dateValue) return false;
  const claimedDate = new Date(dateValue).toDateString();
  const today = new Date().toDateString();
  return claimedDate === today;
};

const VIP_TIERS = [
  { name: 'Bronze', min: 0, rakeback: 0.5, reward: 20 },
  { name: 'Silver', min: 10_000, rakeback: 0.75, reward: 75 },
  { name: 'Gold', min: 50_000, rakeback: 1, reward: 250 },
  { name: 'Platinum', min: 150_000, rakeback: 1.25, reward: 750 },
  { name: 'Diamond', min: 500_000, rakeback: 1.5, reward: 2000 },
  { name: 'Elite', min: 1_000_000, rakeback: 2, reward: 5000 }
];

const getVipProgress = (totalWagered = 0) => {
  const wagered = Number(totalWagered || 0);
  let currentIndex = 0;
  for (let i = 0; i < VIP_TIERS.length; i += 1) {
    if (wagered >= VIP_TIERS[i].min) currentIndex = i;
  }

  const current = VIP_TIERS[currentIndex];
  const next = VIP_TIERS[currentIndex + 1] || null;
  if (!next) {
    return {
      currentTier: current.name,
      nextTier: null,
      progressPercent: 100,
      progressCurrent: wagered,
      progressTarget: wagered,
      remainingToNext: 0,
      rakebackPercent: current.rakeback,
      levelReward: current.reward
    };
  }

  const span = next.min - current.min;
  const progressCurrent = Math.max(0, wagered - current.min);
  const progressPercent = span <= 0 ? 100 : Math.max(0, Math.min(100, (progressCurrent / span) * 100));
  return {
    currentTier: current.name,
    nextTier: next.name,
    progressPercent: Number(progressPercent.toFixed(2)),
    progressCurrent,
    progressTarget: span,
    remainingToNext: Math.max(0, Number((next.min - wagered).toFixed(2))),
    rakebackPercent: current.rakeback,
    levelReward: current.reward
  };
};

const CHALLENGE_DEFINITIONS = [
  { id: 'daily_wager_100', title: 'Daily Wager Sprint', type: 'daily', metric: 'wagered', target: 100, reward: 25, game: 'all' },
  { id: 'daily_rounds_20', title: 'Round Grinder', type: 'daily', metric: 'betsCount', target: 20, reward: 20, game: 'all' },
  { id: 'daily_mines_cashouts_5', title: 'Mines Cashout Chain', type: 'daily', metric: 'gameWins', target: 5, reward: 30, game: 'mines' },
  { id: 'weekly_wager_1500', title: 'Weekly Volume', type: 'weekly', metric: 'wagered', target: 1500, reward: 120, game: 'all' },
  { id: 'weekly_games_4', title: 'Variety Week', type: 'weekly', metric: 'distinctGames', target: 4, reward: 80, game: 'all' },
  { id: 'weekly_plinko_25', title: 'Plinko Festival', type: 'event', metric: 'gameBets', target: 25, reward: 150, game: 'plinko' },
  { id: 'weekly_crash_10_wins', title: 'Crash Pilot', type: 'weekly', metric: 'gameWins', target: 10, reward: 140, game: 'crash' }
];

const getPeriodStart = (period = 'daily') => {
  const now = new Date();
  const start = new Date(now);
  if (period === 'weekly') {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 7);
    return start;
  }
  if (period === 'monthly') {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 30);
    return start;
  }
  if (period === 'all_time') {
    return new Date(0);
  }
  start.setHours(0, 0, 0, 0);
  return start;
};

const createEmptyChallengeStats = () => ({
  wagered: 0,
  betsCount: 0,
  payoutsCount: 0,
  distinctGames: 0,
  games: {}
});

const getChallengeMetricValue = (challenge, stats) => {
  if (challenge.metric === 'wagered') return Number(stats.wagered || 0);
  if (challenge.metric === 'betsCount') return Number(stats.betsCount || 0);
  if (challenge.metric === 'distinctGames') return Number(stats.distinctGames || 0);

  const gameStats = stats.games[challenge.game] || { bets: 0, wins: 0 };
  if (challenge.metric === 'gameWins') return Number(gameStats.wins || 0);
  if (challenge.metric === 'gameBets') return Number(gameStats.bets || 0);
  return 0;
};

const buildChallengeRows = (statsByType, claims = []) => {
  const claimedSet = new Set((claims || []).map((item) => item.challengeId));
  return CHALLENGE_DEFINITIONS.map((challenge) => {
    const stats = statsByType[challenge.type] || createEmptyChallengeStats();
    const progress = getChallengeMetricValue(challenge, stats);
    const target = Number(challenge.target);
    const completed = progress >= target;
    return {
      ...challenge,
      progress: Number(progress.toFixed(2)),
      target,
      completed,
      claimed: claimedSet.has(challenge.id),
      progressPercent: Math.min(100, Number(((progress / target) * 100).toFixed(2)))
    };
  });
};

const CRASH_HOUSE_EDGE = 0.01;
const CRASH_COUNTDOWN_MS = 6000;
const CRASH_RESULTS_MS = 3000;
const CRASH_TICK_MS = 50;
const CRASH_GROWTH_FACTOR = 0.065;
const crashSseClients = new Set();
const crashRateLimit = new Map();
const diceRateLimit = new Map();
const rouletteRateLimit = new Map();

const makeRoundId = () => `cr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const hashSeed = (seed) => crypto.createHash('sha256').update(seed).digest('hex');

const buildDiceRoll = (serverSeed, clientSeed, nonce) => {
  const digest = hashSeed(`${serverSeed}:${clientSeed}:${nonce}`);
  const slice = digest.slice(0, 13);
  const intValue = parseInt(slice, 16);
  const result = intValue / 2 ** 52;
  return Number(Math.floor(result * 10000) / 100);
};

const getHashUnit = (serverSeed, clientSeed, nonce) => {
  const digest = hashSeed(`${serverSeed}:${clientSeed}:${nonce}`);
  return parseInt(digest.slice(0, 13), 16) / 2 ** 52;
};

const buildLimboResult = (serverSeed, clientSeed, nonce) => {
  const unit = getHashUnit(serverSeed, clientSeed, nonce);
  if (unit < 0.01) return 1;
  const value = Math.floor(((0.99 / (1 - unit)) * 100)) / 100;
  return Number(Math.min(1000, Math.max(1, value)).toFixed(2));
};

const VALID_PLINKO_ROWS = [8, 10, 12, 14, 16];
const PLINKO_RISK_CONFIG = {
  low: { min: 0.8, max: 3, power: 1.2, rtpTarget: 0.97 },
  medium: { min: 0.5, max: 9, power: 1.7, rtpTarget: 0.96 },
  high: { min: 0.2, max: 25, power: 2.3, rtpTarget: 0.95 },
  extreme: { min: 0.08, max: 120, power: 3.1, rtpTarget: 0.94 }
};

const combination = (n, k) => {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const m = Math.min(k, n - k);
  let value = 1;
  for (let i = 1; i <= m; i += 1) {
    value = (value * (n - m + i)) / i;
  }
  return value;
};

const getPlinkoMultipliers = (rows, risk) => {
  const normalizedRows = VALID_PLINKO_ROWS.includes(Number(rows)) ? Number(rows) : 12;
  const profile = PLINKO_RISK_CONFIG[risk] || PLINKO_RISK_CONFIG.medium;
  const center = normalizedRows / 2;
  const slotCount = normalizedRows + 1;

  const raw = Array.from({ length: slotCount }, (_, slot) => {
    const distance = Math.abs(slot - center) / Math.max(1, center);
    const score = Math.pow(distance, profile.power);
    return profile.min + (profile.max - profile.min) * score;
  });

  const probs = Array.from({ length: slotCount }, (_, slot) => combination(normalizedRows, slot) / 2 ** normalizedRows);
  const expected = raw.reduce((sum, value, slot) => sum + value * probs[slot], 0);
  const scale = expected > 0 ? profile.rtpTarget / expected : 1;

  return raw.map((value) => Number(Math.max(0.05, value * scale).toFixed(4)));
};

const buildPlinkoResult = (serverSeed, clientSeed, nonce, risk = 'medium', rows = 12) => {
  const normalizedRows = VALID_PLINKO_ROWS.includes(Number(rows)) ? Number(rows) : 12;
  const normalizedRisk = PLINKO_RISK_CONFIG[risk] ? risk : 'medium';
  const digest = hashSeed(`${serverSeed}:${clientSeed}:${nonce}`);
  let rights = 0;
  const path = [];
  for (let i = 0; i < normalizedRows; i += 1) {
    const nibble = parseInt(digest[i], 16);
    const direction = nibble % 2;
    rights += direction;
    path.push(direction);
  }
  const multipliers = getPlinkoMultipliers(normalizedRows, normalizedRisk);
  return {
    slot: rights,
    multiplier: Number((multipliers[rights] || 0).toFixed(4)),
    risk: normalizedRisk,
    rows: normalizedRows,
    path
  };
};

const TOWERS_FLOORS = 8;
const TOWERS_COLUMNS = 3;
const getTowersMultiplier = (safeReveals) => Number((0.99 / Math.pow(2 / 3, Math.max(0, safeReveals))).toFixed(4));

const buildTowersMines = (serverSeed, clientSeed, nonce) => {
  const digest = hashSeed(`${serverSeed}:${clientSeed}:${nonce}`);
  const mines = [];
  let cursor = 0;
  for (let floor = 0; floor < TOWERS_FLOORS; floor += 1) {
    const chunk = digest.slice(cursor, cursor + 2);
    cursor = (cursor + 2) % (digest.length - 2);
    mines.push(parseInt(chunk, 16) % TOWERS_COLUMNS);
  }
  return mines;
};

const getDiceWinChance = (mode, target) => {
  if (mode === 'under') return Number(target.toFixed(2));
  return Number((100 - target).toFixed(2));
};

const getDiceMultiplier = (winChance) => Number((99 / winChance).toFixed(6));

const getDiceOutcome = ({ roll, mode, target }) => {
  if (mode === 'under') return roll < target;
  return roll > target;
};

const EURO_RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const getRouletteColor = (number) => {
  if (number === 0) return 'green';
  return EURO_RED_NUMBERS.has(number) ? 'red' : 'black';
};

const buildRouletteNumber = (serverSeed, clientSeed, nonce) => {
  const digest = hashSeed(`${serverSeed}:${clientSeed}:${nonce}`);
  const slice = digest.slice(0, 13);
  const intValue = parseInt(slice, 16);
  const result = intValue / 2 ** 52;
  return Math.floor(result * 37);
};

const pokerRanks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const pokerSuits = ['S', 'H', 'D', 'C'];
const pokerRankValue = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};
const pokerPaytable = {
  ROYAL_FLUSH: 250,
  STRAIGHT_FLUSH: 50,
  FOUR_OF_A_KIND: 25,
  FULL_HOUSE: 9,
  FLUSH: 6,
  STRAIGHT: 4,
  THREE_OF_A_KIND: 3,
  TWO_PAIR: 2,
  JACKS_OR_BETTER: 1,
  HIGH_CARD: 0
};

const buildPokerDeck = () => {
  const deck = [];
  pokerSuits.forEach((suit) => {
    pokerRanks.forEach((rank) => {
      deck.push(`${rank}${suit}`);
    });
  });
  return deck;
};

const buildPokerShuffledDeck = (serverSeed, clientSeed, nonce) => {
  const deck = buildPokerDeck();
  let cursor = 0;
  let stream = hashSeed(`${serverSeed}:${clientSeed}:${nonce}:poker-shuffle`);

  for (let i = deck.length - 1; i > 0; i -= 1) {
    if (cursor + 8 > stream.length) {
      stream = hashSeed(`${stream}:${i}`);
      cursor = 0;
    }
    const chunk = stream.slice(cursor, cursor + 8);
    cursor += 8;
    const j = parseInt(chunk, 16) % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
};

const evaluatePokerHand = (cards) => {
  if (!Array.isArray(cards) || cards.length !== 5) {
    return { rank: 'HIGH_CARD', multiplier: 0 };
  }

  const ranks = cards.map((card) => card.slice(0, 1));
  const suits = cards.map((card) => card.slice(1, 2));
  const values = ranks.map((rank) => pokerRankValue[rank]).sort((a, b) => a - b);
  const counts = {};
  ranks.forEach((rank) => {
    counts[rank] = (counts[rank] || 0) + 1;
  });
  const groups = Object.values(counts).sort((a, b) => b - a);

  const flush = new Set(suits).size === 1;
  let straight = values.every((value, index) => (index === 0 ? true : value === values[index - 1] + 1));
  const wheel = JSON.stringify(values) === JSON.stringify([2, 3, 4, 5, 14]);
  if (wheel) straight = true;

  if (flush && straight && Math.max(...values) === 14 && Math.min(...values) === 10) {
    return { rank: 'ROYAL_FLUSH', multiplier: pokerPaytable.ROYAL_FLUSH };
  }
  if (flush && straight) {
    return { rank: 'STRAIGHT_FLUSH', multiplier: pokerPaytable.STRAIGHT_FLUSH };
  }
  if (groups[0] === 4) {
    return { rank: 'FOUR_OF_A_KIND', multiplier: pokerPaytable.FOUR_OF_A_KIND };
  }
  if (groups[0] === 3 && groups[1] === 2) {
    return { rank: 'FULL_HOUSE', multiplier: pokerPaytable.FULL_HOUSE };
  }
  if (flush) {
    return { rank: 'FLUSH', multiplier: pokerPaytable.FLUSH };
  }
  if (straight) {
    return { rank: 'STRAIGHT', multiplier: pokerPaytable.STRAIGHT };
  }
  if (groups[0] === 3) {
    return { rank: 'THREE_OF_A_KIND', multiplier: pokerPaytable.THREE_OF_A_KIND };
  }
  if (groups[0] === 2 && groups[1] === 2) {
    return { rank: 'TWO_PAIR', multiplier: pokerPaytable.TWO_PAIR };
  }
  if (groups[0] === 2) {
    const pairRank = Object.entries(counts).find(([, value]) => value === 2)?.[0];
    if (pairRank && ['J', 'Q', 'K', 'A'].includes(pairRank)) {
      return { rank: 'JACKS_OR_BETTER', multiplier: pokerPaytable.JACKS_OR_BETTER };
    }
  }
  return { rank: 'HIGH_CARD', multiplier: pokerPaytable.HIGH_CARD };
};

const rouletteBetDefs = {
  straight: 35,
  red: 1,
  black: 1,
  even: 1,
  odd: 1,
  low: 1,
  high: 1,
  dozen: 2,
  column: 2
};

const validateRouletteBetEntry = (entry) => {
  const type = String(entry?.type || '');
  const amount = Number(entry?.amount || 0);
  const value = entry?.value;

  if (!rouletteBetDefs[type]) return { ok: false, message: `Unsupported bet type: ${type}` };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return { ok: false, message: 'Invalid bet amount' };

  if (type === 'straight') {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 36) return { ok: false, message: 'Straight value must be 0-36' };
    return { ok: true, normalized: { type, value: n, amount: Number(amount.toFixed(2)) } };
  }
  if (type === 'dozen') {
    if (![1, 2, 3].includes(Number(value))) return { ok: false, message: 'Dozen value must be 1,2,3' };
    return { ok: true, normalized: { type, value: Number(value), amount: Number(amount.toFixed(2)) } };
  }
  if (type === 'column') {
    if (![1, 2, 3].includes(Number(value))) return { ok: false, message: 'Column value must be 1,2,3' };
    return { ok: true, normalized: { type, value: Number(value), amount: Number(amount.toFixed(2)) } };
  }

  return { ok: true, normalized: { type, value: null, amount: Number(amount.toFixed(2)) } };
};

const doesRouletteBetWin = (bet, winningNumber, winningColor) => {
  if (bet.type === 'straight') return winningNumber === bet.value;
  if (bet.type === 'red') return winningColor === 'red';
  if (bet.type === 'black') return winningColor === 'black';
  if (bet.type === 'even') return winningNumber !== 0 && winningNumber % 2 === 0;
  if (bet.type === 'odd') return winningNumber % 2 === 1;
  if (bet.type === 'low') return winningNumber >= 1 && winningNumber <= 18;
  if (bet.type === 'high') return winningNumber >= 19 && winningNumber <= 36;
  if (bet.type === 'dozen') {
    if (winningNumber === 0) return false;
    if (bet.value === 1) return winningNumber >= 1 && winningNumber <= 12;
    if (bet.value === 2) return winningNumber >= 13 && winningNumber <= 24;
    return winningNumber >= 25 && winningNumber <= 36;
  }
  if (bet.type === 'column') {
    if (winningNumber === 0) return false;
    const column = ((winningNumber - 1) % 3) + 1;
    return column === bet.value;
  }
  return false;
};

const buildCrashPoint = (serverSeed, clientSeed, nonce) => {
  const digest = hashSeed(`${serverSeed}:${clientSeed}:${nonce}`);
  const slice = digest.slice(0, 13);
  const intValue = parseInt(slice, 16);
  const result = intValue / 2 ** 52;
  if (result < 0.01) return 1.0;
  const crashPoint = Math.floor(1000 * (0.99 / (1 - result))) / 100;
  return Number(Math.min(1000, Math.max(1, crashPoint)).toFixed(2));
};

const crashState = {
  phase: 'countdown',
  countdownLeftMs: CRASH_COUNTDOWN_MS,
  currentMultiplier: 1,
  round: null,
  startedAt: 0,
  nonce: 0,
  tickTimer: null,
  countdownTimer: null
};

const crashClientSafe = (payload) => JSON.stringify(payload);

const emitCrashEvent = (type, data = {}) => {
  const eventPayload = crashClientSafe({
    type,
    ts: Date.now(),
    ...data
  });
  for (const client of crashSseClients) {
    client.write(`data: ${eventPayload}\n\n`);
  }
};

const getCrashHistory = async () => {
  const rounds = await CrashHistory.find().sort({ createdAt: -1 }).limit(100).lean();
  return rounds.map((round) => ({
    roundId: round.roundId,
    crashPoint: Number(round.crashPoint),
    createdAt: round.createdAt
  }));
};

const getLiveBetsForRound = async (roundId) => {
  if (!roundId) return [];
  const bets = await CrashBet.find({ roundId }).sort({ createdAt: -1 }).limit(60).lean();
  const userIds = [...new Set(bets.map((bet) => String(bet.userId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select({ username: 1 })
    .lean();
  const usersById = new Map(users.map((user) => [String(user._id), user.username]));
  return bets.map((bet) => ({
    id: String(bet._id),
    username: usersById.get(String(bet.userId)) || 'Player',
    betAmount: Number(bet.betAmount),
    cashoutAt: bet.cashoutAt ? Number(bet.cashoutAt) : null,
    payout: Number(bet.payout || 0),
    status: bet.status
  }));
};

const settleCrashLosses = async (roundId) => {
  await CrashBet.updateMany({ roundId, status: 'active' }, { $set: { status: 'lost', payout: 0 } });
};

const processAutoCashouts = async () => {
  if (!crashState.round) return;
  const activeBets = await CrashBet.find({
    roundId: crashState.round.roundId,
    status: 'active',
    autoCashoutAt: { $ne: null, $lte: crashState.currentMultiplier }
  }).limit(200);

  for (const bet of activeBets) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const freshBet = await CrashBet.findOne({ _id: bet._id }).session(session);
        if (!freshBet || freshBet.status !== 'active') return;

        const payout = Number((freshBet.betAmount * crashState.currentMultiplier).toFixed(2));
        const updated = await User.findOneAndUpdate(
          { _id: freshBet.userId },
          {
            $inc: {
              balance: payout,
              totalWon: payout
            }
          },
          { session, returnDocument: 'after' }
        );
        if (!updated) return;

        freshBet.cashoutAt = crashState.currentMultiplier;
        freshBet.payout = payout;
        freshBet.status = 'won';
        await freshBet.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }
};

const runCrashTick = async () => {
  if (crashState.phase !== 'running' || !crashState.round) return;
  const elapsedSeconds = (Date.now() - crashState.startedAt) / 1000;
  const nextMultiplier = Number(Math.max(1, Math.exp(CRASH_GROWTH_FACTOR * elapsedSeconds)).toFixed(2));
  crashState.currentMultiplier = nextMultiplier;

  await processAutoCashouts();

  emitCrashEvent('tick', {
    roundId: crashState.round.roundId,
    multiplier: crashState.currentMultiplier
  });

  if (crashState.currentMultiplier >= crashState.round.crashPoint) {
    crashState.phase = 'crashed';
    crashState.currentMultiplier = crashState.round.crashPoint;
    await settleCrashLosses(crashState.round.roundId);
    await CrashHistory.create({
      roundId: crashState.round.roundId,
      crashPoint: crashState.round.crashPoint
    });
    const historyCount = await CrashHistory.countDocuments();
    if (historyCount > 100) {
      const staleRows = await CrashHistory.find().sort({ createdAt: -1 }).skip(100).select({ _id: 1 }).lean();
      const staleIds = staleRows.map((row) => row._id);
      if (staleIds.length > 0) {
        await CrashHistory.deleteMany({ _id: { $in: staleIds } });
      }
    }
    const history = await getCrashHistory();
    const liveBets = await getLiveBetsForRound(crashState.round.roundId);
    emitCrashEvent('crash', {
      roundId: crashState.round.roundId,
      crashPoint: crashState.round.crashPoint,
      history,
      liveBets
    });
    windowClearTimer(crashState.tickTimer);
    crashState.tickTimer = null;
    crashState.phase = 'results';
    emitCrashEvent('results', {
      roundId: crashState.round.roundId,
      crashPoint: crashState.round.crashPoint,
      durationMs: CRASH_RESULTS_MS,
      history,
      liveBets
    });
    crashState.countdownTimer = setTimeout(() => {
      scheduleNextCrashRound();
    }, CRASH_RESULTS_MS);
  }
};

const windowClearTimer = (timer) => {
  if (timer) {
    clearInterval(timer);
    clearTimeout(timer);
  }
};

const scheduleNextCrashRound = () => {
  windowClearTimer(crashState.countdownTimer);
  windowClearTimer(crashState.tickTimer);
  crashState.phase = 'countdown';
  crashState.countdownLeftMs = CRASH_COUNTDOWN_MS;
  crashState.currentMultiplier = 1;
  crashState.nonce += 1;

  const serverSeed = crypto.randomBytes(32).toString('hex');
  const clientSeed = `orbit-client-${Date.now()}`;
  const crashPoint = buildCrashPoint(serverSeed, clientSeed, crashState.nonce);
  const roundId = makeRoundId();
  const hashedServerSeed = hashSeed(serverSeed);

  crashState.round = {
    roundId,
    crashPoint,
    serverSeed,
    clientSeed,
    nonce: crashState.nonce,
    hashedServerSeed
  };

  void CrashRound.create({
    roundId,
    crashPoint,
    serverSeed,
    clientSeed,
    nonce: crashState.nonce,
    hashedServerSeed
  });

  emitCrashEvent('countdown', {
    roundId,
    countdownMs: crashState.countdownLeftMs,
    hashedServerSeed,
    clientSeed,
    nonce: crashState.nonce
  });

  const countdownStartedAt = Date.now();
  crashState.countdownTimer = setInterval(() => {
    const elapsed = Date.now() - countdownStartedAt;
    crashState.countdownLeftMs = Math.max(0, CRASH_COUNTDOWN_MS - elapsed);
    emitCrashEvent('countdown', {
      roundId,
      countdownMs: crashState.countdownLeftMs,
      hashedServerSeed,
      clientSeed,
      nonce: crashState.nonce
    });
    if (crashState.countdownLeftMs <= 0) {
      windowClearTimer(crashState.countdownTimer);
      crashState.countdownTimer = null;
      crashState.phase = 'running';
      crashState.startedAt = Date.now();
      crashState.currentMultiplier = 1;
      emitCrashEvent('start', { roundId, multiplier: 1 });
      crashState.tickTimer = setInterval(() => {
        void runCrashTick();
      }, CRASH_TICK_MS);
    }
  }, 250);
};

async function seedDefaults() {
  const ownerEmail = 'owner@rapidrolls.gg';
  const adminEmail = 'admin@rapidrolls.gg';
  const playerEmail = 'player@rapidrolls.gg';

  const ownerExists = await User.findOne({ email: ownerEmail });
  if (!ownerExists) {
    await User.create({
      username: 'site_owner',
      email: ownerEmail,
      passwordHash: await bcrypt.hash('owner123', 10),
      role: 'owner',
      vipTier: 'Diamond',
      dailyReward: 25,
      balance: 5000
    });
  }

  const adminExists = await User.findOne({ email: adminEmail });
  if (!adminExists) {
    await User.create({
      username: 'site_admin',
      email: adminEmail,
      passwordHash: await bcrypt.hash('admin123', 10),
      role: 'admin'
    });
  }

  const playerExists = await User.findOne({ email: playerEmail });
  if (!playerExists) {
    await User.create({
      username: 'rapid_player',
      email: playerEmail,
      passwordHash: await bcrypt.hash('player123', 10),
      role: 'player'
    });
  }

  const starterPromos = [
    {
      title: 'Starter Welcome Pack',
      description: 'Kick off with bonus demo credits and unlock your first challenges.',
      image: '/site/promo-welcome.svg',
      path: '/wallet',
      cta: 'Claim Starter Pack',
      badge: 'Starter',
      amount: 1000,
      uses: 999999,
      usesRemaining: 999999,
      enabled: true,
      rewardType: 'deposit_bonus',
      placement: 'lobby'
    },
    {
      title: 'Daily Boost x2',
      description: 'Double your daily reward value for active sessions.',
      image: '/site/promo-cashback.svg',
      path: '/daily',
      cta: 'Activate Daily Boost',
      badge: 'Daily',
      amount: 20,
      uses: 999999,
      usesRemaining: 999999,
      enabled: true,
      rewardType: 'daily_boost',
      placement: 'promotions'
    },
    {
      title: 'Weekend Race Event',
      description: 'Play featured games and climb the weekend leaderboard for bonus prizes.',
      image: '/site/promo-race.svg',
      path: '/leaderboard',
      cta: 'Join Weekend Race',
      badge: 'Event',
      amount: 250,
      uses: 999999,
      usesRemaining: 999999,
      enabled: true,
      rewardType: 'leaderboard_event',
      placement: 'lobby'
    }
  ];

  for (const promo of starterPromos) {
    await Promotion.findOneAndUpdate(
      { title: promo.title },
      { $setOnInsert: promo },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
  }

  await Promotion.updateMany(
    { image: { $regex: '^https://picsum\\.photos/', $options: 'i' } },
    { $set: { image: '/site/promo-default.svg' } }
  );

  const messageCount = await Message.countDocuments({ channel: 'global' });
  if (messageCount === 0) {
    await Message.insertMany([
      { channel: 'global', user: 'NeonJackpot', text: 'Anyone on Crash Zone right now?' },
      { channel: 'global', user: 'RapidQueen', text: 'Leaderboard event starts soon.' },
      { channel: 'global', user: 'DealerBot', text: 'Daily bonus is live for eligible players.' }
    ]);
  }

  const adminMsgCount = await Message.countDocuments({ channel: 'admin' });
  if (adminMsgCount === 0) {
    await Message.insertMany([
      { channel: 'admin', user: 'site_admin', text: 'Reviewing promo queue now.' },
      { channel: 'admin', user: 'ops_mod', text: 'Chat moderation filters are active.' }
    ]);
  }

  const requiredGames = [
    { slug: 'dice-rush', title: 'Dice Rush', enabled: true },
    { slug: 'crash-zone', title: 'Crash Zone', enabled: true },
    { slug: 'roulette-pro', title: 'Roulette Pro', enabled: true },
    { slug: 'blackjack-live', title: 'Blackjack Live', enabled: true },
    { slug: 'poker-arena', title: 'Poker Arena', enabled: true },
    { slug: 'mines-master', title: 'Mines Master', enabled: true },
    { slug: 'keno-blast', title: 'Keno Blast', enabled: true },
    { slug: 'mole-digger-slots', title: 'Mole Digger Slots', enabled: true },
    { slug: 'rise-of-olympus-1000', title: 'Rise of Olympus 1000', enabled: true },
    { slug: 'fangs-and-fire', title: 'Fangs and Fire', enabled: true },
    { slug: 'lawnnd-isorder', title: 'Lawnnd Isorder', enabled: true },
    { slug: 'hotdog-heist', title: 'Hotdog Heist', enabled: true },
    { slug: 'bonanza-down-under', title: 'Bonanza Down Under', enabled: true },
    { slug: 'slot-storm', title: 'Slot Storm', enabled: true },
    { slug: 'limbo-vault', title: 'Limbo Vault', enabled: true },
    { slug: 'plinko-drop', title: 'Plinko Drop', enabled: true },
    { slug: 'towers-x', title: 'Towers X', enabled: true }
  ];
  for (const game of requiredGames) {
    await Game.findOneAndUpdate({ slug: game.slug }, game, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
  }

  await Setting.findOneAndUpdate(
    { key: 'site_online' },
    { key: 'site_online', value: true },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  await Setting.findOneAndUpdate(
    { key: 'dice_nonce_global' },
    { key: 'dice_nonce_global', value: 0 },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  const diceSeed = crypto.randomBytes(32).toString('hex');
  await Setting.findOneAndUpdate(
    { key: 'dice_server_seed' },
    { key: 'dice_server_seed', value: diceSeed },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  await Setting.findOneAndUpdate(
    { key: 'roulette_nonce_global' },
    { key: 'roulette_nonce_global', value: 0 },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  const rouletteSeed = crypto.randomBytes(32).toString('hex');
  await Setting.findOneAndUpdate(
    { key: 'roulette_server_seed' },
    { key: 'roulette_server_seed', value: rouletteSeed },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  await Setting.findOneAndUpdate(
    { key: 'poker_nonce_global' },
    { key: 'poker_nonce_global', value: 0 },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  await Setting.findOneAndUpdate(
    { key: 'poker_server_seed' },
    { key: 'poker_server_seed', value: crypto.randomBytes(32).toString('hex') },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  await Setting.findOneAndUpdate(
    { key: 'limbo_nonce_global' },
    { key: 'limbo_nonce_global', value: 0 },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  await Setting.findOneAndUpdate(
    { key: 'plinko_nonce_global' },
    { key: 'plinko_nonce_global', value: 0 },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  await Setting.findOneAndUpdate(
    { key: 'towers_nonce_global' },
    { key: 'towers_nonce_global', value: 0 },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  await Setting.findOneAndUpdate(
    { key: 'limbo_server_seed' },
    { key: 'limbo_server_seed', value: crypto.randomBytes(32).toString('hex') },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  await Setting.findOneAndUpdate(
    { key: 'plinko_server_seed' },
    { key: 'plinko_server_seed', value: crypto.randomBytes(32).toString('hex') },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  await Setting.findOneAndUpdate(
    { key: 'towers_server_seed' },
    { key: 'towers_server_seed', value: crypto.randomBytes(32).toString('hex') },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
}

const authRequired = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ message: 'Missing auth token' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'Invalid token user' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
};

app.get('/api/health', async (_req, res) => {
  const readyState = mongoose.connection.readyState;
  res.json({
    ok: true,
    dbReady,
    mongooseReadyState: readyState,
    uptimeSec: Math.floor(process.uptime())
  });
});

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  const safeEmail = String(email || '').trim().toLowerCase();

  if (!username || !safeEmail || !password) {
    return res.status(400).json({ message: 'username, email, and password are required' });
  }

  const existing = await User.findOne({ email: safeEmail });
  if (existing) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const user = await User.create({
    username: String(username).trim(),
    email: safeEmail,
    passwordHash: await bcrypt.hash(String(password), 10),
    role: 'player',
    balance: 1000,
    vipTier: 'Bronze',
    dailyReward: 10
  });

  const token = makeToken(user);
  await audit({
    action: 'auth.register',
    actor: user.username,
    actorRole: user.role,
    target: user.email
  });
  res.status(201).json({ token, user: sanitizeUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const safeEmail = String(email || '').trim().toLowerCase();

  if (!safeEmail || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  const user = await User.findOne({ email: safeEmail });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(String(password), user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = makeToken(user);
  await audit({
    action: 'auth.login',
    actor: user.username,
    actorRole: user.role,
    target: user.email
  });
  res.json({ token, user: sanitizeUser(user) });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

app.post('/api/auth/logout', authRequired, (_req, res) => {
  audit({
    action: 'auth.logout',
    actor: _req.user.username,
    actorRole: _req.user.role,
    target: _req.user.email
  });
  res.json({ ok: true });
});

app.post('/api/wallet/claim-daily', authRequired, async (req, res) => {
  if (isClaimedToday(req.user.lastDailyClaimedAt)) {
    return res.status(409).json({ message: 'Daily already claimed today' });
  }

  const session = await mongoose.startSession();
  let updatedUser = null;
  let claimAmount = 0;
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id).session(session);
      if (!user) throw new Error('user not found');
      if (isClaimedToday(user.lastDailyClaimedAt)) throw new Error('Daily already claimed today');

      claimAmount = Number(user.dailyReward || 0);
      const balanceBefore = Number(user.balance || 0);
      user.balance = Number((balanceBefore + claimAmount).toFixed(2));
      user.lastDailyClaimedAt = new Date();
      await user.save({ session });
      updatedUser = user;

      await DailyClaim.create(
        [
          {
            userId: user._id,
            amount: claimAmount,
            claimedAt: user.lastDailyClaimedAt
          }
        ],
        { session }
      );

      await Transaction.create(
        [
          {
            userId: user._id,
            game: 'wallet',
            type: 'daily_claim',
            amount: claimAmount,
            balanceBefore,
            balanceAfter: user.balance,
            meta: { reason: 'daily_bonus' }
          }
        ],
        { session }
      );
    });
  } catch (error) {
    if (error.message === 'Daily already claimed today') {
      return res.status(409).json({ message: error.message });
    }
    throw error;
  } finally {
    await session.endSession();
  }

  await audit({
    action: 'wallet.claim_daily',
    actor: updatedUser.username,
    actorRole: updatedUser.role,
    target: updatedUser.email,
    meta: { dailyReward: claimAmount, newBalance: updatedUser.balance }
  });

  res.json({ user: sanitizeUser(updatedUser) });
});

app.post('/api/wallet/deposit', authRequired, async (req, res) => {
  const amount = Number(req.body?.amount || 0);
  if (amount <= 0) {
    return res.status(400).json({ message: 'amount must be > 0' });
  }

  req.user.balance = Number((req.user.balance + amount).toFixed(2));
  await req.user.save();
  await audit({
    action: 'wallet.deposit',
    actor: req.user.username,
    actorRole: req.user.role,
    target: req.user.email,
    meta: { amount, newBalance: req.user.balance }
  });
  res.json({ user: sanitizeUser(req.user) });
});

app.post('/api/wallet/withdraw', authRequired, async (req, res) => {
  const amount = Number(req.body?.amount || 0);
  if (amount <= 0) {
    return res.status(400).json({ message: 'amount must be > 0' });
  }
  if (req.user.balance < amount) {
    return res.status(400).json({ message: 'insufficient funds' });
  }

  req.user.balance = Number((req.user.balance - amount).toFixed(2));
  await req.user.save();
  await audit({
    action: 'wallet.withdraw',
    actor: req.user.username,
    actorRole: req.user.role,
    target: req.user.email,
    meta: { amount, newBalance: req.user.balance }
  });
  res.json({ user: sanitizeUser(req.user) });
});

app.get('/api/vip/summary', authRequired, async (req, res) => {
  const user = await User.findById(req.user._id).lean();
  if (!user) {
    return res.status(404).json({ message: 'user not found' });
  }

  const monthStart = new Date();
  monthStart.setDate(monthStart.getDate() - 30);

  const [gameRows, recentClaims, monthlyRows] = await Promise.all([
    Transaction.aggregate([
      { $match: { userId: req.user._id, type: 'bet' } },
      {
        $group: {
          _id: '$game',
          totalSpent: { $sum: '$amount' },
          betsCount: { $sum: 1 }
        }
      },
      { $sort: { totalSpent: -1 } }
    ]),
    DailyClaim.find({ userId: req.user._id }).sort({ claimedAt: -1 }).limit(7).lean(),
    Transaction.aggregate([
      { $match: { userId: req.user._id, type: 'bet', createdAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])
  ]);

  const progress = getVipProgress(user.totalWagered || 0);
  const monthlyWagered = Number((monthlyRows[0]?.total || 0).toFixed(2));

  if (user.vipTier !== progress.currentTier) {
    await User.updateOne({ _id: user._id }, { $set: { vipTier: progress.currentTier } });
  }

  res.json({
    user: sanitizeUser({ ...user, vipTier: progress.currentTier }),
    vip: {
      ...progress,
      monthlyWagered,
      gamesTracked: gameRows.map((row) => ({
        game: row._id || 'unknown',
        totalSpent: Number((row.totalSpent || 0).toFixed(2)),
        betsCount: Number(row.betsCount || 0)
      })),
      recentDailyClaims: recentClaims.map((row) => ({
        id: String(row._id),
        amount: Number(row.amount || 0),
        claimedAt: row.claimedAt || row.createdAt
      })),
      tiers: VIP_TIERS
    }
  });
});

app.get('/api/challenges/state', authRequired, async (req, res) => {
  const [user, txRows] = await Promise.all([
    User.findById(req.user._id).lean(),
    Transaction.find({ userId: req.user._id, type: { $in: ['bet', 'payout'] } })
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean()
  ]);

  if (!user) {
    return res.status(404).json({ message: 'user not found' });
  }

  const now = new Date();
  const dailyStart = getPeriodStart('daily');
  const weeklyStart = getPeriodStart('weekly');

  const daily = createEmptyChallengeStats();
  const weekly = createEmptyChallengeStats();
  const event = createEmptyChallengeStats();

  const attach = (bucket, row) => {
    const game = String(row.game || 'unknown');
    if (!bucket.games[game]) bucket.games[game] = { bets: 0, wins: 0 };
    if (row.type === 'bet') {
      bucket.wagered += Number(row.amount || 0);
      bucket.betsCount += 1;
      bucket.games[game].bets += 1;
    }
    if (row.type === 'payout') {
      bucket.payoutsCount += 1;
      bucket.games[game].wins += 1;
    }
  };

  txRows.forEach((row) => {
    const createdAt = new Date(row.createdAt);
    if (createdAt >= dailyStart) attach(daily, row);
    if (createdAt >= weeklyStart) attach(weekly, row);
    attach(event, row);
  });

  daily.distinctGames = Object.keys(daily.games).filter((key) => daily.games[key].bets > 0).length;
  weekly.distinctGames = Object.keys(weekly.games).filter((key) => weekly.games[key].bets > 0).length;
  event.distinctGames = Object.keys(event.games).filter((key) => event.games[key].bets > 0).length;

  const rows = buildChallengeRows(
    {
      daily,
      weekly,
      event
    },
    user.challengeClaims || []
  );

  res.json({
    serverTime: now.toISOString(),
    resetAt: {
      daily: new Date(dailyStart.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      weekly: new Date(weeklyStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    stats: {
      daily: {
        wagered: Number(daily.wagered.toFixed(2)),
        betsCount: daily.betsCount,
        winsCount: daily.payoutsCount
      },
      weekly: {
        wagered: Number(weekly.wagered.toFixed(2)),
        betsCount: weekly.betsCount,
        winsCount: weekly.payoutsCount,
        distinctGames: weekly.distinctGames
      }
    },
    challenges: rows
  });
});

app.post('/api/challenges/claim', authRequired, async (req, res) => {
  const challengeId = String(req.body?.challengeId || '').trim();
  if (!challengeId) {
    return res.status(400).json({ message: 'challengeId required' });
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ message: 'user not found' });
  }

  if ((user.challengeClaims || []).some((claim) => claim.challengeId === challengeId)) {
    return res.status(409).json({ message: 'Challenge already claimed' });
  }

  const [txRows] = await Promise.all([
    Transaction.find({ userId: req.user._id, type: { $in: ['bet', 'payout'] } }).sort({ createdAt: -1 }).limit(5000).lean()
  ]);

  const dailyStart = getPeriodStart('daily');
  const weeklyStart = getPeriodStart('weekly');
  const daily = createEmptyChallengeStats();
  const weekly = createEmptyChallengeStats();
  const event = createEmptyChallengeStats();

  const attach = (bucket, row) => {
    const game = String(row.game || 'unknown');
    if (!bucket.games[game]) bucket.games[game] = { bets: 0, wins: 0 };
    if (row.type === 'bet') {
      bucket.wagered += Number(row.amount || 0);
      bucket.betsCount += 1;
      bucket.games[game].bets += 1;
    }
    if (row.type === 'payout') bucket.games[game].wins += 1;
  };

  txRows.forEach((row) => {
    const createdAt = new Date(row.createdAt);
    if (createdAt >= dailyStart) attach(daily, row);
    if (createdAt >= weeklyStart) attach(weekly, row);
    attach(event, row);
  });
  daily.distinctGames = Object.keys(daily.games).filter((key) => daily.games[key].bets > 0).length;
  weekly.distinctGames = Object.keys(weekly.games).filter((key) => weekly.games[key].bets > 0).length;
  event.distinctGames = Object.keys(event.games).filter((key) => event.games[key].bets > 0).length;

  const challenge = CHALLENGE_DEFINITIONS.find((row) => row.id === challengeId);
  if (!challenge) {
    return res.status(404).json({ message: 'Challenge not found' });
  }

  const sourceStats = challenge.type === 'daily' ? daily : challenge.type === 'weekly' ? weekly : event;
  const progress = getChallengeMetricValue(challenge, sourceStats);
  if (progress < challenge.target) {
    return res.status(400).json({ message: 'Challenge not complete yet' });
  }

  const reward = Number(challenge.reward || 0);
  const balanceBefore = Number(user.balance || 0);
  user.balance = Number((balanceBefore + reward).toFixed(2));
  user.challengeClaims = [...(user.challengeClaims || []), { challengeId, claimedAt: new Date() }];
  await user.save();

  await Transaction.create({
    userId: user._id,
    game: 'challenges',
    type: 'challenge_reward',
    amount: reward,
    balanceBefore,
    balanceAfter: user.balance,
    meta: { challengeId }
  });

  await audit({
    action: 'challenge.claim',
    actor: user.username,
    actorRole: user.role,
    target: challengeId,
    meta: { reward, progress, target: challenge.target }
  });

  res.json({
    ok: true,
    challengeId,
    reward,
    user: sanitizeUser(user)
  });
});

app.get('/api/leaderboard', authRequired, async (req, res) => {
  const period = String(req.query.period || 'daily').toLowerCase();
  const category = String(req.query.category || 'total_winnings').toLowerCase();
  const gameFilter = String(req.query.game || 'all').toLowerCase();
  const search = String(req.query.search || '').trim().toLowerCase();
  const startAt = getPeriodStart(period);

  const filters = {
    createdAt: { $gte: startAt }
  };
  if (gameFilter !== 'all') filters.game = gameFilter;

  const txRows = await Transaction.find(filters).lean();
  const userMap = new Map();

  txRows.forEach((row) => {
    const key = String(row.userId);
    if (!userMap.has(key)) {
      userMap.set(key, {
        userId: key,
        totalWinnings: 0,
        biggestSingleWin: 0,
        gamesPlayed: 0,
        plinkoHigh: 0,
        minesWins: 0
      });
    }
    const entry = userMap.get(key);
    if (row.type === 'bet') entry.gamesPlayed += 1;
    if (row.type === 'payout') {
      const value = Number(row.amount || 0);
      entry.totalWinnings += value;
      entry.biggestSingleWin = Math.max(entry.biggestSingleWin, value);
      if (row.game === 'plinko') entry.plinkoHigh = Math.max(entry.plinkoHigh, value);
      if (row.game === 'mines') entry.minesWins += 1;
    }
  });

  const userIds = [...userMap.keys()].map((id) => new mongoose.Types.ObjectId(id));
  const users = await User.find({ _id: { $in: userIds } }).select('username vipTier').lean();
  const names = new Map(users.map((row) => [String(row._id), row]));

  let rows = [...userMap.values()].map((entry) => ({
    userId: entry.userId,
    username: names.get(entry.userId)?.username || 'Unknown',
    vipTier: names.get(entry.userId)?.vipTier || 'Bronze',
    totalWinnings: Number(entry.totalWinnings.toFixed(2)),
    biggestSingleWin: Number(entry.biggestSingleWin.toFixed(2)),
    gamesPlayed: entry.gamesPlayed,
    plinkoHigh: Number(entry.plinkoHigh.toFixed(2)),
    minesWins: entry.minesWins
  }));

  if (search) {
    rows = rows.filter((row) => row.username.toLowerCase().includes(search));
  }

  const scoreByCategory = {
    total_winnings: (row) => row.totalWinnings,
    biggest_single_win: (row) => row.biggestSingleWin,
    most_games_played: (row) => row.gamesPlayed,
    plinko_highs: (row) => row.plinkoHigh,
    mines_streak: (row) => row.minesWins,
    poker_wins: () => 0
  };
  const scoreFn = scoreByCategory[category] || scoreByCategory.total_winnings;
  rows.sort((a, b) => scoreFn(b) - scoreFn(a));

  const ranked = rows.slice(0, 200).map((row, index) => ({
    rank: index + 1,
    score: Number(scoreFn(row).toFixed(2)),
    ...row
  }));

  const me = ranked.find((row) => row.userId === String(req.user._id)) || null;
  res.json({
    period,
    category,
    game: gameFilter,
    rows: ranked,
    me
  });
});

app.get('/api/slots/image/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').trim().toLowerCase();
  const launchUrl = SLOT_IMAGE_SOURCES[slug];
  const fallback = `/games/${slug}.svg`;
  if (!launchUrl) {
    return res.redirect(fallback);
  }

  const now = Date.now();
  const cached = slotImageCache.get(slug);
  if (cached?.url && cached.expiresAt > now) {
    return res.redirect(cached.url || fallback);
  }

  // Always respond fast with fallback, then refresh provider image in background.
  slotImageCache.set(slug, {
    url: cached?.url || fallback,
    expiresAt: now + 1000 * 60 * 5,
    refreshing: Boolean(cached?.refreshing)
  });
  void refreshSlotImageInBackground(slug, launchUrl, fallback);
  return res.redirect(slotImageCache.get(slug)?.url || fallback);
});

app.get('/api/public/state', async (_req, res) => {
  const [promotions, games, globalMessages, siteSetting] = await Promise.all([
    Promotion.find().sort({ createdAt: -1 }).lean(),
    Game.find().sort({ title: 1 }).lean(),
    Message.find({ channel: 'global' }).sort({ createdAt: 1 }).limit(150).lean(),
    Setting.findOne({ key: 'site_online' }).lean()
  ]);

  const activePromotions = promotions.filter((promo) => isPromotionActive(promo));

  res.json({
    promotions: activePromotions,
    games,
    globalMessages,
    isSiteOnline: Boolean(siteSetting?.value)
  });
});

app.get('/api/platform/state', authRequired, async (req, res) => {
  const [promotions, games, globalMessages, siteSetting] = await Promise.all([
    Promotion.find().sort({ createdAt: -1 }).lean(),
    Game.find().sort({ title: 1 }).lean(),
    Message.find({ channel: 'global' }).sort({ createdAt: 1 }).limit(200).lean(),
    Setting.findOne({ key: 'site_online' }).lean()
  ]);

  const activePromotions = promotions.filter((promo) => isPromotionActive(promo));

  const payload = {
    promotions: req.user.role === 'admin' || req.user.role === 'owner' ? promotions : activePromotions,
    games,
    globalMessages,
    isSiteOnline: Boolean(siteSetting?.value)
  };

  if (req.user.role === 'admin' || req.user.role === 'owner') {
    const [users, adminMessages] = await Promise.all([
      User.find().sort({ createdAt: -1 }).lean(),
      Message.find({ channel: 'admin' }).sort({ createdAt: 1 }).limit(200).lean()
    ]);

    payload.users = users.map((user) => ({
      id: String(user._id),
      username: user.username,
      email: user.email,
      role: user.role
    }));
    payload.adminMessages = adminMessages;
  }

  res.json(payload);
});

app.post('/api/chat/global', authRequired, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) {
    return res.status(400).json({ message: 'text is required' });
  }

  const message = await Message.create({ channel: 'global', user: req.user.username, text });
  await audit({
    action: 'chat.global.send',
    actor: req.user.username,
    actorRole: req.user.role,
    target: String(message._id)
  });
  res.status(201).json(message);
});

app.post('/api/chat/global/public', async (req, res) => {
  const user = String(req.body?.user || 'Guest').trim();
  const guestIdRaw = String(req.body?.guestId || '').trim();
  const guestId = guestIdRaw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  const text = String(req.body?.text || '').trim();
  if (!text) {
    return res.status(400).json({ message: 'text is required' });
  }

  const safeUser = user.slice(0, 32) || (guestId ? `Guest-${guestId.slice(0, 4).toUpperCase()}` : 'Guest');
  const message = await Message.create({ channel: 'global', user: safeUser, text, guestId: guestId || null });
  await audit({
    action: 'chat.global.send_public',
    actor: safeUser,
    actorRole: 'guest',
    target: String(message._id)
  });
  res.status(201).json(message);
});

app.delete('/api/chat/global/:id', authRequired, requireRole('admin', 'owner'), async (req, res) => {
  await Message.deleteOne({ _id: req.params.id, channel: 'global' });
  await audit({
    action: 'chat.global.delete',
    actor: req.user.username,
    actorRole: req.user.role,
    target: req.params.id
  });
  res.json({ ok: true });
});

app.delete('/api/chat/global', authRequired, requireRole('admin', 'owner'), async (_req, res) => {
  await Message.deleteMany({ channel: 'global' });
  await audit({
    action: 'chat.global.clear',
    actor: _req.user.username,
    actorRole: _req.user.role
  });
  res.json({ ok: true });
});

app.post('/api/chat/announcement', authRequired, requireRole('admin', 'owner'), async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) {
    return res.status(400).json({ message: 'text is required' });
  }

  const message = await Message.create({ channel: 'global', user: 'DealerBot', text });
  await audit({
    action: 'chat.announcement.post',
    actor: req.user.username,
    actorRole: req.user.role,
    target: String(message._id)
  });
  res.status(201).json(message);
});

app.post('/api/chat/admin', authRequired, requireRole('admin', 'owner'), async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) {
    return res.status(400).json({ message: 'text is required' });
  }

  const message = await Message.create({ channel: 'admin', user: req.user.username, text });
  await audit({
    action: 'chat.admin.send',
    actor: req.user.username,
    actorRole: req.user.role,
    target: String(message._id)
  });
  res.status(201).json(message);
});

app.post('/api/promotions', authRequired, requireRole('admin', 'owner'), async (req, res) => {
  const {
    name,
    title,
    description,
    image,
    badge,
    cta,
    path,
    amount,
    uses,
    enabled,
    startAt,
    endAt,
    audience,
    rewardType,
    rewardConfig,
    placement,
    promoCode,
    notifyOnPublish
  } = req.body || {};
  const normalizedName = String(name || title || '').trim();
  const normalizedTitle = String(title || name || '').trim();
  const normalizedDescription = String(description || '').trim();
  const normalizedAmount = Number(amount || 0);
  const normalizedUses = Math.max(0, Math.floor(Number(uses || 0)));
  const normalizedStartAt = startAt ? new Date(startAt) : null;
  const normalizedEndAt = endAt ? new Date(endAt) : null;
  const normalizedAudience = ['all', 'vip', 'new_users', 'inactive_users'].includes(String(audience || 'all'))
    ? String(audience)
    : 'all';
  const normalizedRewardType = [
    'deposit_bonus',
    'daily_boost',
    'free_spins',
    'cashback',
    'challenge_boost',
    'leaderboard_event',
    'promo_code'
  ].includes(String(rewardType || 'daily_boost'))
    ? String(rewardType)
    : 'daily_boost';
  const normalizedPlacement = ['lobby', 'promotions', 'game', 'vip'].includes(String(placement || 'promotions'))
    ? String(placement)
    : 'promotions';
  const normalizedPromoCode = String(promoCode || '')
    .trim()
    .toUpperCase()
    .slice(0, 24);

  if (!normalizedName || !normalizedDescription) {
    return res.status(400).json({ message: 'name and description are required' });
  }
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
    return res.status(400).json({ message: 'amount must be a positive number' });
  }
  if (normalizedStartAt && Number.isNaN(normalizedStartAt.getTime())) {
    return res.status(400).json({ message: 'invalid startAt date' });
  }
  if (normalizedEndAt && Number.isNaN(normalizedEndAt.getTime())) {
    return res.status(400).json({ message: 'invalid endAt date' });
  }
  if (normalizedStartAt && normalizedEndAt && normalizedStartAt >= normalizedEndAt) {
    return res.status(400).json({ message: 'startAt must be before endAt' });
  }
  if (normalizedPromoCode) {
    const existingCode = await Promotion.findOne({ promoCode: normalizedPromoCode });
    if (existingCode) {
      return res.status(409).json({ message: 'promoCode already exists' });
    }
  }

  const promotion = await Promotion.create({
    name: normalizedName,
    title: normalizedTitle,
    description: normalizedDescription,
    image: image || '/site/promo-default.svg',
    badge: badge || 'New',
    cta: cta || 'Claim',
    path: path || '/promotions',
    amount: Number(normalizedAmount.toFixed(2)),
    uses: normalizedUses,
    usesRemaining: normalizedUses,
    enabled: enabled !== false,
    startAt: normalizedStartAt,
    endAt: normalizedEndAt,
    audience: normalizedAudience,
    rewardType: normalizedRewardType,
    rewardConfig: rewardConfig && typeof rewardConfig === 'object' ? rewardConfig : {},
    placement: normalizedPlacement,
    promoCode: normalizedPromoCode,
    notifyOnPublish: Boolean(notifyOnPublish)
  });
  await audit({
    action: 'promotion.create',
    actor: req.user.username,
    actorRole: req.user.role,
    target: String(promotion._id),
    meta: { title: promotion.title }
  });

  if (promotion.notifyOnPublish && isPromotionActive(promotion)) {
    await Message.create({
      channel: 'global',
      user: 'DealerBot',
      text: `New promotion live: ${promotion.title}. ${promotion.cta || 'Check promotions now.'}`
    });
  }

  res.status(201).json(promotion);
});

app.patch('/api/promotions/:id', authRequired, requireRole('admin', 'owner'), async (req, res) => {
  const promo = await Promotion.findById(req.params.id);
  if (!promo) {
    return res.status(404).json({ message: 'promotion not found' });
  }

  const next = req.body || {};
  const nextStartAt = next.startAt ? new Date(next.startAt) : null;
  const nextEndAt = next.endAt ? new Date(next.endAt) : null;
  if (next.startAt && Number.isNaN(nextStartAt.getTime())) {
    return res.status(400).json({ message: 'invalid startAt date' });
  }
  if (next.endAt && Number.isNaN(nextEndAt.getTime())) {
    return res.status(400).json({ message: 'invalid endAt date' });
  }
  if (nextStartAt && nextEndAt && nextStartAt >= nextEndAt) {
    return res.status(400).json({ message: 'startAt must be before endAt' });
  }

  if (next.promoCode !== undefined) {
    const code = String(next.promoCode || '')
      .trim()
      .toUpperCase()
      .slice(0, 24);
    if (code) {
      const existingCode = await Promotion.findOne({ promoCode: code, _id: { $ne: promo._id } });
      if (existingCode) {
        return res.status(409).json({ message: 'promoCode already exists' });
      }
      promo.promoCode = code;
    } else {
      promo.promoCode = '';
    }
  }

  if (next.name !== undefined) promo.name = String(next.name || '').trim() || promo.name;
  if (next.title !== undefined) promo.title = String(next.title || '').trim() || promo.title;
  if (next.description !== undefined) promo.description = String(next.description || '').trim() || promo.description;
  if (next.image !== undefined) promo.image = String(next.image || '').trim() || '/site/promo-default.svg';
  if (next.badge !== undefined) promo.badge = String(next.badge || '').trim() || 'New';
  if (next.cta !== undefined) promo.cta = String(next.cta || '').trim() || 'Claim';
  if (next.path !== undefined) promo.path = String(next.path || '').trim() || '/promotions';
  if (next.enabled !== undefined) promo.enabled = Boolean(next.enabled);
  if (next.startAt !== undefined) promo.startAt = nextStartAt;
  if (next.endAt !== undefined) promo.endAt = nextEndAt;
  if (next.audience !== undefined) {
    promo.audience = ['all', 'vip', 'new_users', 'inactive_users'].includes(String(next.audience)) ? String(next.audience) : 'all';
  }
  if (next.rewardType !== undefined) {
    promo.rewardType = [
      'deposit_bonus',
      'daily_boost',
      'free_spins',
      'cashback',
      'challenge_boost',
      'leaderboard_event',
      'promo_code'
    ].includes(String(next.rewardType))
      ? String(next.rewardType)
      : 'daily_boost';
  }
  if (next.rewardConfig !== undefined && next.rewardConfig && typeof next.rewardConfig === 'object') {
    promo.rewardConfig = next.rewardConfig;
  }
  if (next.placement !== undefined) {
    promo.placement = ['lobby', 'promotions', 'game', 'vip'].includes(String(next.placement))
      ? String(next.placement)
      : 'promotions';
  }
  if (next.notifyOnPublish !== undefined) promo.notifyOnPublish = Boolean(next.notifyOnPublish);

  if (next.amount !== undefined) {
    const parsed = Number(next.amount || 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return res.status(400).json({ message: 'amount must be a positive number' });
    }
    promo.amount = Number(parsed.toFixed(2));
  }
  if (next.uses !== undefined) {
    const parsedUses = Math.max(0, Math.floor(Number(next.uses || 0)));
    promo.uses = parsedUses;
    if (promo.usesRemaining > parsedUses) promo.usesRemaining = parsedUses;
  }
  if (next.usesRemaining !== undefined) {
    promo.usesRemaining = Math.max(0, Math.floor(Number(next.usesRemaining || 0)));
  }

  await promo.save();
  await audit({
    action: 'promotion.update',
    actor: req.user.username,
    actorRole: req.user.role,
    target: String(promo._id),
    meta: { title: promo.title }
  });

  if (promo.notifyOnPublish && isPromotionActive(promo)) {
    await Message.create({
      channel: 'global',
      user: 'DealerBot',
      text: `Promotion updated: ${promo.title}. ${promo.cta || 'Open promotions for details.'}`
    });
  }

  res.json(promo);
});

app.patch('/api/users/:id/password', authRequired, requireRole('admin', 'owner'), async (req, res) => {
  const password = String(req.body?.password || '').trim();
  if (!password) {
    return res.status(400).json({ message: 'password is required' });
  }

  const target = await User.findById(req.params.id);
  if (!target) {
    return res.status(404).json({ message: 'user not found' });
  }

  if (target.role === 'owner' && req.user.role !== 'owner') {
    return res.status(403).json({ message: 'only owner can modify owner account' });
  }

  target.passwordHash = await bcrypt.hash(password, 10);
  await target.save();
  await audit({
    action: 'user.password.update',
    actor: req.user.username,
    actorRole: req.user.role,
    target: target.email
  });

  res.json({ ok: true });
});

app.post('/api/users/admin', authRequired, requireRole('owner'), async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '').trim();

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'username, email, password required' });
  }

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({ message: 'email already exists' });
  }

  const user = await User.create({
    username,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'admin'
  });
  await audit({
    action: 'admin.add',
    actor: req.user.username,
    actorRole: req.user.role,
    target: user.email
  });

  res.status(201).json({ id: String(user._id), username: user.username, email: user.email, role: user.role });
});

app.delete('/api/users/:id/admin', authRequired, requireRole('owner'), async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) {
    return res.status(404).json({ message: 'user not found' });
  }
  if (target.role !== 'admin') {
    return res.status(400).json({ message: 'target is not admin' });
  }

  await User.deleteOne({ _id: target._id });
  await audit({
    action: 'admin.remove',
    actor: req.user.username,
    actorRole: req.user.role,
    target: target.email
  });
  res.json({ ok: true });
});

app.patch('/api/platform/site-online', authRequired, requireRole('owner'), async (req, res) => {
  const value = Boolean(req.body?.isSiteOnline);
  const setting = await Setting.findOneAndUpdate(
    { key: 'site_online' },
    { key: 'site_online', value },
    { upsert: true, returnDocument: 'after' }
  );
  await audit({
    action: 'site.online.toggle',
    actor: req.user.username,
    actorRole: req.user.role,
    meta: { isSiteOnline: Boolean(setting.value) }
  });

  res.json({ isSiteOnline: Boolean(setting.value) });
});

app.patch('/api/games/:slug/enabled', authRequired, requireRole('owner'), async (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  const game = await Game.findOneAndUpdate(
    { slug: req.params.slug },
    { enabled },
    { returnDocument: 'after' }
  );

  if (!game) {
    return res.status(404).json({ message: 'game not found' });
  }
  await audit({
    action: 'game.toggle',
    actor: req.user.username,
    actorRole: req.user.role,
    target: game.slug,
    meta: { enabled: game.enabled }
  });

  res.json(game);
});

app.get('/api/admin/logs', authRequired, requireRole('admin', 'owner'), async (_req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(250).lean();
  res.json({ logs });
});

const checkRateLimit = (bucket, key, maxCalls = 30, windowMs = 10_000) => {
  const now = Date.now();
  const row = bucket.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > row.resetAt) {
    row.count = 0;
    row.resetAt = now + windowMs;
  }
  row.count += 1;
  bucket.set(key, row);
  return row.count <= maxCalls;
};

const checkCrashRateLimit = (key, maxCalls = 30, windowMs = 10_000) =>
  checkRateLimit(crashRateLimit, key, maxCalls, windowMs);
const checkDiceRateLimit = (key, maxCalls = 20, windowMs = 10_000) =>
  checkRateLimit(diceRateLimit, key, maxCalls, windowMs);
const checkRouletteRateLimit = (key, maxCalls = 20, windowMs = 10_000) =>
  checkRateLimit(rouletteRateLimit, key, maxCalls, windowMs);

app.get('/api/crash/state', async (_req, res) => {
  const history = await getCrashHistory();
  const liveBets = await getLiveBetsForRound(crashState.round?.roundId);

  res.json({
    phase: crashState.phase,
    roundId: crashState.round?.roundId || null,
    multiplier: crashState.currentMultiplier,
    countdownMs: crashState.phase === 'countdown' ? crashState.countdownLeftMs : 0,
    hashedServerSeed: crashState.round?.hashedServerSeed || null,
    clientSeed: crashState.round?.clientSeed || null,
    nonce: crashState.round?.nonce ?? null,
    history,
    liveBets
  });
});

app.get('/api/crash/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache'
  });
  res.write('\n');
  crashSseClients.add(res);

  const history = await getCrashHistory();
  const liveBets = await getLiveBetsForRound(crashState.round?.roundId);
  res.write(
    `data: ${crashClientSafe({
      type: 'state',
      phase: crashState.phase,
      roundId: crashState.round?.roundId || null,
      multiplier: crashState.currentMultiplier,
      countdownMs: crashState.countdownLeftMs,
      hashedServerSeed: crashState.round?.hashedServerSeed || null,
      clientSeed: crashState.round?.clientSeed || null,
      nonce: crashState.round?.nonce ?? null,
      history,
      liveBets
    })}\n\n`
  );

  req.on('close', () => {
    crashSseClients.delete(res);
  });
});

app.post('/api/crash/bet', authRequired, async (req, res) => {
  const key = `${req.user._id}:bet`;
  if (!checkCrashRateLimit(key, 20, 10_000)) {
    return res.status(429).json({ message: 'Rate limit exceeded' });
  }

  if (crashState.phase !== 'countdown' || !crashState.round) {
    return res.status(409).json({ message: 'Betting is closed for this round' });
  }

  const betAmount = Number(req.body?.betAmount || 0);
  const autoCashoutAtRaw = Number(req.body?.autoCashoutAt || 0);
  const autoCashoutAt = autoCashoutAtRaw >= 1.01 ? Number(autoCashoutAtRaw.toFixed(2)) : null;
  if (!Number.isFinite(betAmount) || betAmount <= 0) {
    return res.status(400).json({ message: 'Invalid bet amount' });
  }

  const existingBet = await CrashBet.findOne({
    userId: req.user._id,
    roundId: crashState.round.roundId,
    status: 'active'
  });
  if (existingBet) {
    return res.status(409).json({ message: 'Active bet already exists for this round' });
  }

  const session = await mongoose.startSession();
  let updatedUser = null;
  let createdBet = null;
  try {
    await session.withTransaction(async () => {
      updatedUser = await User.findOneAndUpdate(
        { _id: req.user._id, balance: { $gte: betAmount } },
        {
          $inc: {
            balance: -betAmount,
            totalWagered: betAmount
          }
        },
        { returnDocument: 'after', session }
      );

      if (!updatedUser) {
        throw new Error('Insufficient balance');
      }

      createdBet = await CrashBet.create(
        [
          {
            userId: req.user._id,
            roundId: crashState.round.roundId,
            betAmount,
            autoCashoutAt,
            status: 'active'
          }
        ],
        { session }
      );

      const balanceAfter = Number(updatedUser.balance || 0);
      const balanceBefore = Number((balanceAfter + betAmount).toFixed(2));
      await Transaction.create(
        [
          {
            userId: req.user._id,
            game: 'crash',
            type: 'bet',
            amount: betAmount,
            balanceBefore,
            balanceAfter,
            meta: { roundId: crashState.round.roundId, autoCashoutAt }
          }
        ],
        { session }
      );
    });
  } catch (error) {
    if (error.message === 'Insufficient balance') {
      return res.status(400).json({ message: error.message });
    }
    throw error;
  } finally {
    await session.endSession();
  }

  const liveBets = await getLiveBetsForRound(crashState.round.roundId);
  emitCrashEvent('bet', { roundId: crashState.round.roundId, liveBets });

  res.status(201).json({
    betId: String(createdBet[0]._id),
    roundId: crashState.round.roundId,
    user: sanitizeUser(updatedUser)
  });
});

app.post('/api/crash/cancel', authRequired, async (req, res) => {
  const key = `${req.user._id}:cancel`;
  if (!checkCrashRateLimit(key, 20, 10_000)) {
    return res.status(429).json({ message: 'Rate limit exceeded' });
  }
  if (crashState.phase !== 'countdown' || !crashState.round) {
    return res.status(409).json({ message: 'Cannot cancel after round start' });
  }

  const session = await mongoose.startSession();
  let updatedUser = null;
  let targetBet = null;
  try {
    await session.withTransaction(async () => {
      targetBet = await CrashBet.findOne({
        userId: req.user._id,
        roundId: crashState.round.roundId,
        status: 'active'
      }).session(session);

      if (!targetBet) {
        throw new Error('No active bet');
      }

      targetBet.status = 'cancelled';
      targetBet.payout = targetBet.betAmount;
      await targetBet.save({ session });

      updatedUser = await User.findOneAndUpdate(
        { _id: req.user._id },
        { $inc: { balance: targetBet.betAmount, totalWagered: -targetBet.betAmount } },
        { returnDocument: 'after', session }
      );

      const balanceAfter = Number(updatedUser.balance || 0);
      const balanceBefore = Number((balanceAfter - targetBet.betAmount).toFixed(2));
      await Transaction.create(
        [
          {
            userId: req.user._id,
            game: 'crash',
            type: 'payout',
            amount: Number(targetBet.betAmount || 0),
            balanceBefore,
            balanceAfter,
            meta: { roundId: crashState.round.roundId, reason: 'cancel_refund' }
          }
        ],
        { session }
      );
    });
  } catch (error) {
    if (error.message === 'No active bet') {
      return res.status(404).json({ message: error.message });
    }
    throw error;
  } finally {
    await session.endSession();
  }

  const liveBets = await getLiveBetsForRound(crashState.round.roundId);
  emitCrashEvent('bet', { roundId: crashState.round.roundId, liveBets });
  res.json({ ok: true, user: sanitizeUser(updatedUser), betId: String(targetBet._id) });
});

app.post('/api/crash/cashout', authRequired, async (req, res) => {
  const key = `${req.user._id}:cashout`;
  if (!checkCrashRateLimit(key, 40, 10_000)) {
    return res.status(429).json({ message: 'Rate limit exceeded' });
  }

  if (crashState.phase !== 'running' || !crashState.round) {
    return res.status(409).json({ message: 'Round is not active' });
  }

  const roundId = crashState.round.roundId;
  const cashoutAt = crashState.currentMultiplier;
  const session = await mongoose.startSession();
  let updatedUser = null;
  let bet = null;
  let payout = 0;
  try {
    await session.withTransaction(async () => {
      bet = await CrashBet.findOne({
        userId: req.user._id,
        roundId,
        status: 'active'
      }).session(session);

      if (!bet) {
        throw new Error('No active bet');
      }

      payout = Number((bet.betAmount * cashoutAt).toFixed(2));
      updatedUser = await User.findOneAndUpdate(
        { _id: req.user._id },
        {
          $inc: {
            balance: payout,
            totalWon: payout
          }
        },
        { returnDocument: 'after', session }
      );
      bet.cashoutAt = cashoutAt;
      bet.payout = payout;
      bet.status = 'won';
      await bet.save({ session });

      const balanceAfter = Number(updatedUser.balance || 0);
      const balanceBefore = Number((balanceAfter - payout).toFixed(2));
      await Transaction.create(
        [
          {
            userId: req.user._id,
            game: 'crash',
            type: 'payout',
            amount: payout,
            balanceBefore,
            balanceAfter,
            meta: { roundId, cashoutAt, betAmount: Number(bet.betAmount || 0) }
          }
        ],
        { session }
      );
    });
  } catch (error) {
    if (error.message === 'No active bet') {
      return res.status(404).json({ message: error.message });
    }
    throw error;
  } finally {
    await session.endSession();
  }

  const liveBets = await getLiveBetsForRound(roundId);
  emitCrashEvent('cashout', { roundId, userId: String(req.user._id), liveBets });
  res.json({
    ok: true,
    payout,
    cashoutAt,
    user: sanitizeUser(updatedUser)
  });
});

app.get('/api/crash/my-bet', authRequired, async (req, res) => {
  if (!crashState.round) {
    return res.json({ bet: null });
  }
  const bet = await CrashBet.findOne({
    userId: req.user._id,
    roundId: crashState.round.roundId
  })
    .sort({ createdAt: -1 })
    .lean();
  res.json({
    bet: bet
      ? {
          id: String(bet._id),
          roundId: bet.roundId,
          betAmount: Number(bet.betAmount),
          autoCashoutAt: bet.autoCashoutAt ? Number(bet.autoCashoutAt) : null,
          cashoutAt: bet.cashoutAt ? Number(bet.cashoutAt) : null,
          payout: Number(bet.payout || 0),
          status: bet.status
        }
      : null
  });
});

app.post('/api/crash/verify', async (req, res) => {
  const serverSeed = String(req.body?.serverSeed || '');
  const clientSeed = String(req.body?.clientSeed || '');
  const nonce = Number(req.body?.nonce ?? -1);

  if (!serverSeed || !clientSeed || nonce < 0) {
    return res.status(400).json({ message: 'serverSeed, clientSeed, nonce required' });
  }

  const calculated = buildCrashPoint(serverSeed, clientSeed, nonce);
  res.json({
    crashPoint: calculated,
    hashedServerSeed: hashSeed(serverSeed),
    clientSeed,
    nonce
  });
});

const getNextDiceNonce = async () => {
  const setting = await Setting.findOneAndUpdate(
    { key: 'dice_nonce_global' },
    { $inc: { value: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );
  return Number(setting.value || 1);
};

const getNextGenericNonce = async (key) => {
  const setting = await Setting.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );
  return Number(setting.value || 1);
};

const getCurrentGenericSeed = async (key) => {
  const setting = await Setting.findOne({ key });
  if (setting?.value) return String(setting.value);
  const seed = crypto.randomBytes(32).toString('hex');
  await Setting.findOneAndUpdate(
    { key },
    { key, value: seed },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );
  return seed;
};

const rotateGenericSeed = async (key) => {
  const seed = crypto.randomBytes(32).toString('hex');
  await Setting.findOneAndUpdate(
    { key },
    { key, value: seed },
    { returnDocument: 'after', upsert: true }
  );
};

const getCurrentDiceSeed = async () => {
  const setting = await Setting.findOne({ key: 'dice_server_seed' });
  if (setting?.value) return String(setting.value);
  const seed = crypto.randomBytes(32).toString('hex');
  await Setting.findOneAndUpdate(
    { key: 'dice_server_seed' },
    { key: 'dice_server_seed', value: seed },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );
  return seed;
};

const rotateDiceSeed = async () => {
  const seed = crypto.randomBytes(32).toString('hex');
  await Setting.findOneAndUpdate(
    { key: 'dice_server_seed' },
    { key: 'dice_server_seed', value: seed },
    { returnDocument: 'after', upsert: true }
  );
};

app.post('/api/dice/roll', authRequired, async (req, res) => {
  const key = `${req.user._id}:dice_roll`;
  if (!checkDiceRateLimit(key, 30, 10_000)) {
    return res.status(429).json({ message: 'Rate limit exceeded' });
  }

  const betAmount = Number(req.body?.betAmount || 0);
  const target = Number(req.body?.target || 0);
  const mode = String(req.body?.mode || '');
  const clientSeed = String(req.body?.clientSeed || `client-${req.user._id}`).slice(0, 80);

  if (!Number.isFinite(betAmount) || betAmount <= 0) {
    return res.status(400).json({ message: 'Invalid bet amount' });
  }
  if (betAmount > 1_000_000) {
    return res.status(400).json({ message: 'Bet amount exceeds limit' });
  }
  if (!['under', 'over'].includes(mode)) {
    return res.status(400).json({ message: 'Invalid mode' });
  }
  if (!Number.isFinite(target) || target < 2 || target > 98) {
    return res.status(400).json({ message: 'Target must be between 2 and 98' });
  }

  const winChance = getDiceWinChance(mode, target);
  if (winChance <= 1 || winChance >= 99) {
    return res.status(400).json({ message: 'Win chance out of bounds' });
  }

  const multiplier = getDiceMultiplier(winChance);
  const nonce = await getNextDiceNonce();
  const serverSeed = await getCurrentDiceSeed();
  const serverSeedHash = hashSeed(serverSeed);
  const roll = buildDiceRoll(serverSeed, clientSeed, nonce);
  const didWin = getDiceOutcome({ roll, mode, target });
  const payout = didWin ? Number((betAmount * multiplier).toFixed(2)) : 0;
  const profit = Number((payout - betAmount).toFixed(2));

  const session = await mongoose.startSession();
  let updatedUser = null;
  let createdBet = null;
  try {
    await session.withTransaction(async () => {
      const userBefore = await User.findOne({ _id: req.user._id }).session(session);
      if (!userBefore || userBefore.balance < betAmount) {
        throw new Error('Insufficient balance');
      }

      const balanceBeforeBet = Number(userBefore.balance);
      userBefore.balance = Number((userBefore.balance - betAmount + payout).toFixed(2));
      userBefore.totalWagered = Number((userBefore.totalWagered + betAmount).toFixed(2));
      if (didWin) {
        userBefore.totalWon = Number((userBefore.totalWon + payout).toFixed(2));
      }
      await userBefore.save({ session });
      updatedUser = userBefore;

      createdBet = await DiceBet.create(
        [
          {
            userId: req.user._id,
            betAmount,
            target,
            mode,
            roll,
            winChance,
            multiplier,
            payout,
            profit,
            status: didWin ? 'won' : 'lost',
            serverSeedHash,
            serverSeed,
            clientSeed,
            nonce
          }
        ],
        { session }
      );

      const txRows = [
        {
          userId: req.user._id,
          game: 'dice',
          type: 'bet',
          amount: betAmount,
          balanceBefore: balanceBeforeBet,
          balanceAfter: Number((balanceBeforeBet - betAmount).toFixed(2)),
          meta: { mode, target, nonce }
        }
      ];

      if (didWin) {
        txRows.push({
          userId: req.user._id,
          game: 'dice',
          type: 'payout',
          amount: payout,
          balanceBefore: Number((balanceBeforeBet - betAmount).toFixed(2)),
          balanceAfter: Number((balanceBeforeBet - betAmount + payout).toFixed(2)),
          meta: { mode, target, nonce, roll }
        });
      }

      await Transaction.insertMany(txRows, { session });
    });
  } catch (error) {
    if (error.message === 'Insufficient balance') {
      return res.status(400).json({ message: error.message });
    }
    throw error;
  } finally {
    await session.endSession();
  }

  await rotateDiceSeed();

  res.status(201).json({
    id: String(createdBet[0]._id),
    roll,
    target,
    mode,
    winChance: Number(winChance.toFixed(2)),
    multiplier: Number(multiplier.toFixed(6)),
    payout,
    profit,
    status: didWin ? 'won' : 'lost',
    nonce,
    hashedServerSeed: serverSeedHash,
    clientSeed,
    user: sanitizeUser(updatedUser)
  });
});

app.post('/api/dice/verify', async (req, res) => {
  const serverSeed = String(req.body?.serverSeed || '');
  const clientSeed = String(req.body?.clientSeed || '');
  const nonce = Number(req.body?.nonce ?? -1);

  if (!serverSeed || !clientSeed || nonce < 0) {
    return res.status(400).json({ message: 'serverSeed, clientSeed, nonce required' });
  }

  const roll = buildDiceRoll(serverSeed, clientSeed, nonce);
  res.json({
    roll,
    nonce,
    clientSeed,
    hashedServerSeed: hashSeed(serverSeed)
  });
});

app.get('/api/dice/history', authRequired, async (req, res) => {
  const rows = await DiceBet.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({
    history: rows.map((row) => ({
      id: String(row._id),
      betAmount: Number(row.betAmount),
      target: Number(row.target),
      mode: row.mode,
      roll: Number(row.roll),
      winChance: Number(row.winChance),
      multiplier: Number(row.multiplier),
      payout: Number(row.payout),
      profit: Number(row.profit),
      status: row.status,
      nonce: Number(row.nonce),
      serverSeedHash: row.serverSeedHash,
      clientSeed: row.clientSeed,
      createdAt: row.createdAt
    }))
  });
});

const getNextRouletteNonce = async () => {
  const setting = await Setting.findOneAndUpdate(
    { key: 'roulette_nonce_global' },
    { $inc: { value: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );
  return Number(setting.value || 1);
};

const getCurrentRouletteSeed = async () => {
  const setting = await Setting.findOne({ key: 'roulette_server_seed' });
  if (setting?.value) return String(setting.value);
  const seed = crypto.randomBytes(32).toString('hex');
  await Setting.findOneAndUpdate(
    { key: 'roulette_server_seed' },
    { key: 'roulette_server_seed', value: seed },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );
  return seed;
};

const rotateRouletteSeed = async () => {
  const seed = crypto.randomBytes(32).toString('hex');
  await Setting.findOneAndUpdate(
    { key: 'roulette_server_seed' },
    { key: 'roulette_server_seed', value: seed },
    { returnDocument: 'after', upsert: true }
  );
};

const getNextPokerNonce = async () => {
  const setting = await Setting.findOneAndUpdate(
    { key: 'poker_nonce_global' },
    { $inc: { value: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );
  return Number(setting.value || 1);
};

const getCurrentPokerSeed = async () => {
  const setting = await Setting.findOne({ key: 'poker_server_seed' });
  if (setting?.value) return String(setting.value);
  const seed = crypto.randomBytes(32).toString('hex');
  await Setting.findOneAndUpdate(
    { key: 'poker_server_seed' },
    { key: 'poker_server_seed', value: seed },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );
  return seed;
};

const rotatePokerSeed = async () => {
  const seed = crypto.randomBytes(32).toString('hex');
  await Setting.findOneAndUpdate(
    { key: 'poker_server_seed' },
    { key: 'poker_server_seed', value: seed },
    { returnDocument: 'after', upsert: true }
  );
};

app.post('/api/roulette/spin', authRequired, async (req, res) => {
  const key = `${req.user._id}:roulette_spin`;
  if (!checkRouletteRateLimit(key, 20, 10_000)) {
    return res.status(429).json({ message: 'Rate limit exceeded' });
  }

  const betsRaw = Array.isArray(req.body?.bets) ? req.body.bets : [];
  const clientSeed = String(req.body?.clientSeed || `roulette-client-${req.user._id}`).slice(0, 80);

  if (betsRaw.length === 0) {
    return res.status(400).json({ message: 'At least one bet is required' });
  }
  if (betsRaw.length > 150) {
    return res.status(400).json({ message: 'Too many bets in one spin' });
  }

  const bets = [];
  for (const entry of betsRaw) {
    const validated = validateRouletteBetEntry(entry);
    if (!validated.ok) {
      return res.status(400).json({ message: validated.message });
    }
    bets.push(validated.normalized);
  }

  const totalBetAmount = Number(bets.reduce((sum, row) => sum + row.amount, 0).toFixed(2));
  if (totalBetAmount <= 0) {
    return res.status(400).json({ message: 'Total bet amount must be > 0' });
  }

  const nonce = await getNextRouletteNonce();
  const serverSeed = await getCurrentRouletteSeed();
  const hashedServerSeed = hashSeed(serverSeed);
  const winningNumber = buildRouletteNumber(serverSeed, clientSeed, nonce);
  const color = getRouletteColor(winningNumber);
  const spinId = `rlt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const betResults = bets.map((bet) => {
    const win = doesRouletteBetWin(bet, winningNumber, color);
    const payoutRatio = rouletteBetDefs[bet.type];
    const payout = win ? Number((bet.amount * (payoutRatio + 1)).toFixed(2)) : 0;
    const profit = Number((payout - bet.amount).toFixed(2));
    return {
      ...bet,
      win,
      payout,
      profit,
      payoutRatio
    };
  });

  const totalPayout = Number(betResults.reduce((sum, row) => sum + row.payout, 0).toFixed(2));
  const totalProfit = Number((totalPayout - totalBetAmount).toFixed(2));
  const status = totalPayout <= 0 ? 'lost' : totalPayout > totalBetAmount ? 'won' : 'partial_win';

  const session = await mongoose.startSession();
  let updatedUser = null;
  try {
    await session.withTransaction(async () => {
      const user = await User.findOne({ _id: req.user._id }).session(session);
      if (!user || user.balance < totalBetAmount) {
        throw new Error('Insufficient balance');
      }

      const balanceBefore = Number(user.balance);
      user.balance = Number((user.balance - totalBetAmount + totalPayout).toFixed(2));
      user.totalWagered = Number((user.totalWagered + totalBetAmount).toFixed(2));
      if (totalPayout > 0) {
        user.totalWon = Number((user.totalWon + totalPayout).toFixed(2));
      }
      await user.save({ session });
      updatedUser = user;

      await RouletteSpin.create(
        [
          {
            spinId,
            winningNumber,
            color,
            hashedServerSeed,
            serverSeed,
            clientSeed,
            nonce
          }
        ],
        { session }
      );

      await RouletteBetSlip.create(
        [
          {
            userId: req.user._id,
            spinId,
            totalBetAmount,
            bets,
            totalPayout,
            totalProfit,
            status
          }
        ],
        { session }
      );

      const txRows = [
        {
          userId: req.user._id,
          game: 'roulette',
          type: 'bet',
          amount: totalBetAmount,
          balanceBefore,
          balanceAfter: Number((balanceBefore - totalBetAmount).toFixed(2)),
          meta: { spinId, betsCount: bets.length }
        }
      ];
      if (totalPayout > 0) {
        txRows.push({
          userId: req.user._id,
          game: 'roulette',
          type: 'payout',
          amount: totalPayout,
          balanceBefore: Number((balanceBefore - totalBetAmount).toFixed(2)),
          balanceAfter: Number((balanceBefore - totalBetAmount + totalPayout).toFixed(2)),
          meta: { spinId, winningNumber, color }
        });
      }
      await Transaction.insertMany(txRows, { session });
    });
  } catch (error) {
    if (error.message === 'Insufficient balance') {
      return res.status(400).json({ message: error.message });
    }
    throw error;
  } finally {
    await session.endSession();
  }

  await rotateRouletteSeed();

  res.status(201).json({
    spinId,
    winningNumber,
    color,
    hashedServerSeed,
    nonce,
    betResults,
    totalBetAmount,
    totalPayout,
    totalProfit,
    status,
    user: sanitizeUser(updatedUser)
  });
});

app.post('/api/roulette/verify', async (req, res) => {
  const serverSeed = String(req.body?.serverSeed || '');
  const clientSeed = String(req.body?.clientSeed || '');
  const nonce = Number(req.body?.nonce ?? -1);
  if (!serverSeed || !clientSeed || nonce < 0) {
    return res.status(400).json({ message: 'serverSeed, clientSeed, nonce required' });
  }

  const winningNumber = buildRouletteNumber(serverSeed, clientSeed, nonce);
  res.json({
    winningNumber,
    color: getRouletteColor(winningNumber),
    hashedServerSeed: hashSeed(serverSeed),
    clientSeed,
    nonce
  });
});

app.get('/api/roulette/history', async (_req, res) => {
  const rows = await RouletteSpin.find().sort({ createdAt: -1 }).limit(120).lean();
  res.json({
    history: rows.map((row) => ({
      spinId: row.spinId,
      winningNumber: Number(row.winningNumber),
      color: row.color,
      hashedServerSeed: row.hashedServerSeed,
      nonce: Number(row.nonce),
      createdAt: row.createdAt
    }))
  });
});

app.post('/api/poker/deal', authRequired, async (req, res) => {
  const betAmount = Number(req.body?.betAmount || 0);
  const clientSeed = String(req.body?.clientSeed || `poker-client-${req.user._id}`).slice(0, 80);
  if (!Number.isFinite(betAmount) || betAmount <= 0 || betAmount > 1_000_000) {
    return res.status(400).json({ message: 'Invalid bet amount' });
  }

  const activeHand = await PokerHand.findOne({ userId: req.user._id, status: 'active' });
  if (activeHand) {
    return res.status(409).json({ message: 'Finish your active poker hand first' });
  }

  const nonce = await getNextPokerNonce();
  const serverSeed = await getCurrentPokerSeed();
  const serverSeedHash = hashSeed(serverSeed);
  const shuffled = buildPokerShuffledDeck(serverSeed, clientSeed, nonce);
  const initialHand = shuffled.slice(0, 5);
  const deck = shuffled.slice(5);

  let created = null;
  let updatedUser = null;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id).session(session);
      if (!user || user.balance < betAmount) throw new Error('Insufficient balance');

      const balanceBefore = Number(user.balance || 0);
      user.balance = Number((balanceBefore - betAmount).toFixed(2));
      user.totalWagered = Number((user.totalWagered + betAmount).toFixed(2));
      await user.save({ session });
      updatedUser = user;

      created = await PokerHand.create(
        [
          {
            userId: req.user._id,
            betAmount,
            status: 'active',
            initialHand,
            finalHand: [],
            deck,
            holds: [false, false, false, false, false],
            handRank: '',
            multiplier: 0,
            payout: 0,
            profit: Number((-betAmount).toFixed(2)),
            serverSeedHash,
            serverSeed,
            clientSeed,
            nonce
          }
        ],
        { session }
      );

      await Transaction.create(
        [
          {
            userId: req.user._id,
            game: 'poker',
            type: 'bet',
            amount: betAmount,
            balanceBefore,
            balanceAfter: Number((balanceBefore - betAmount).toFixed(2)),
            meta: { nonce }
          }
        ],
        { session }
      );
    });
  } catch (error) {
    if (error.message === 'Insufficient balance') {
      return res.status(400).json({ message: error.message });
    }
    throw error;
  } finally {
    await session.endSession();
  }

  res.status(201).json({
    handId: String(created[0]._id),
    status: 'active',
    betAmount,
    hand: initialHand,
    nonce,
    hashedServerSeed: serverSeedHash,
    clientSeed,
    user: sanitizeUser(updatedUser),
    paytable: pokerPaytable
  });
});

app.post('/api/poker/draw', authRequired, async (req, res) => {
  const handId = String(req.body?.handId || '').trim();
  const holdsInput = Array.isArray(req.body?.holds) ? req.body.holds : [];
  if (!handId) return res.status(400).json({ message: 'handId required' });
  if (holdsInput.length !== 5) return res.status(400).json({ message: 'holds must be array of 5 booleans' });
  const holds = holdsInput.map((value) => Boolean(value));

  const hand = await PokerHand.findOne({ _id: handId, userId: req.user._id, status: 'active' });
  if (!hand) {
    return res.status(404).json({ message: 'Active hand not found' });
  }

  let deck = [...hand.deck];
  const finalHand = [...hand.initialHand];
  for (let i = 0; i < 5; i += 1) {
    if (!holds[i]) {
      const next = deck.shift();
      if (!next) return res.status(500).json({ message: 'Deck exhausted unexpectedly' });
      finalHand[i] = next;
    }
  }

  const evaluated = evaluatePokerHand(finalHand);
  const multiplier = Number(evaluated.multiplier || 0);
  const payout = Number((Number(hand.betAmount || 0) * multiplier).toFixed(2));
  const profit = Number((payout - Number(hand.betAmount || 0)).toFixed(2));

  let updatedUser = null;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id).session(session);
      if (!user) throw new Error('user not found');

      const balanceBefore = Number(user.balance || 0);
      user.balance = Number((balanceBefore + payout).toFixed(2));
      if (payout > 0) {
        user.totalWon = Number((user.totalWon + payout).toFixed(2));
      }
      await user.save({ session });
      updatedUser = user;

      hand.status = 'completed';
      hand.holds = holds;
      hand.finalHand = finalHand;
      hand.deck = deck;
      hand.handRank = evaluated.rank;
      hand.multiplier = multiplier;
      hand.payout = payout;
      hand.profit = profit;
      await hand.save({ session });

      if (payout > 0) {
        await Transaction.create(
          [
            {
              userId: req.user._id,
              game: 'poker',
              type: 'payout',
              amount: payout,
              balanceBefore,
              balanceAfter: Number((balanceBefore + payout).toFixed(2)),
              meta: { handId: String(hand._id), handRank: evaluated.rank, multiplier }
            }
          ],
          { session }
        );
      }
    });
  } finally {
    await session.endSession();
  }

  await rotatePokerSeed();

  res.json({
    handId: String(hand._id),
    status: hand.status,
    initialHand: hand.initialHand,
    finalHand,
    holds,
    handRank: evaluated.rank,
    multiplier,
    payout,
    profit,
    betAmount: Number(hand.betAmount || 0),
    hashedServerSeed: hand.serverSeedHash,
    nonce: Number(hand.nonce || 0),
    user: sanitizeUser(updatedUser),
    paytable: pokerPaytable
  });
});

app.get('/api/poker/history', authRequired, async (req, res) => {
  const rows = await PokerHand.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({
    history: rows.map((row) => ({
      id: String(row._id),
      betAmount: Number(row.betAmount || 0),
      status: row.status,
      handRank: row.handRank || '',
      multiplier: Number(row.multiplier || 0),
      payout: Number(row.payout || 0),
      profit: Number(row.profit || 0),
      finalHand: row.finalHand?.length ? row.finalHand : row.initialHand,
      nonce: Number(row.nonce || 0),
      serverSeedHash: row.serverSeedHash,
      clientSeed: row.clientSeed,
      createdAt: row.createdAt
    }))
  });
});

app.post('/api/limbo/play', authRequired, async (req, res) => {
  const betAmount = Number(req.body?.betAmount || 0);
  const target = Number(req.body?.target || 2);
  const clientSeed = String(req.body?.clientSeed || `limbo-client-${req.user._id}`).slice(0, 80);
  if (!Number.isFinite(betAmount) || betAmount <= 0) return res.status(400).json({ message: 'Invalid bet amount' });
  if (!Number.isFinite(target) || target < 1.01 || target > 1000) return res.status(400).json({ message: 'Target out of range' });

  const nonce = await getNextGenericNonce('limbo_nonce_global');
  const serverSeed = await getCurrentGenericSeed('limbo_server_seed');
  const hashedServerSeed = hashSeed(serverSeed);
  const resultMultiplier = buildLimboResult(serverSeed, clientSeed, nonce);
  const didWin = resultMultiplier >= target;
  const payout = didWin ? Number((betAmount * target).toFixed(2)) : 0;
  const profit = Number((payout - betAmount).toFixed(2));

  const session = await mongoose.startSession();
  let updatedUser = null;
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id).session(session);
      if (!user || user.balance < betAmount) throw new Error('Insufficient balance');
      const balanceBefore = Number(user.balance);
      user.balance = Number((user.balance - betAmount + payout).toFixed(2));
      user.totalWagered = Number((user.totalWagered + betAmount).toFixed(2));
      if (payout > 0) user.totalWon = Number((user.totalWon + payout).toFixed(2));
      await user.save({ session });
      updatedUser = user;

      const rows = [
        {
          userId: req.user._id,
          game: 'limbo',
          type: 'bet',
          amount: betAmount,
          balanceBefore,
          balanceAfter: Number((balanceBefore - betAmount).toFixed(2)),
          meta: { target, nonce }
        }
      ];
      if (payout > 0) {
        rows.push({
          userId: req.user._id,
          game: 'limbo',
          type: 'payout',
          amount: payout,
          balanceBefore: Number((balanceBefore - betAmount).toFixed(2)),
          balanceAfter: Number((balanceBefore - betAmount + payout).toFixed(2)),
          meta: { target, nonce, resultMultiplier }
        });
      }
      await Transaction.insertMany(rows, { session });
    });
  } catch (error) {
    if (error.message === 'Insufficient balance') return res.status(400).json({ message: error.message });
    throw error;
  } finally {
    await session.endSession();
  }

  await rotateGenericSeed('limbo_server_seed');
  res.status(201).json({
    resultMultiplier,
    target,
    payout,
    profit,
    status: didWin ? 'won' : 'lost',
    nonce,
    hashedServerSeed,
    clientSeed,
    user: sanitizeUser(updatedUser)
  });
});

app.post('/api/plinko/drop', authRequired, async (req, res) => {
  const betAmount = Number(req.body?.betAmount || 0);
  const risk = String(req.body?.risk || 'medium').toLowerCase();
  const rows = Number(req.body?.rows || 12);
  const clientSeed = String(req.body?.clientSeed || `plinko-client-${req.user._id}`).slice(0, 80);
  if (!Number.isFinite(betAmount) || betAmount <= 0) return res.status(400).json({ message: 'Invalid bet amount' });
  if (!['low', 'medium', 'high', 'extreme'].includes(risk)) return res.status(400).json({ message: 'Invalid risk' });
  if (!VALID_PLINKO_ROWS.includes(rows)) return res.status(400).json({ message: 'Invalid rows' });

  const nonce = await getNextGenericNonce('plinko_nonce_global');
  const serverSeed = await getCurrentGenericSeed('plinko_server_seed');
  const hashedServerSeed = hashSeed(serverSeed);
  const outcome = buildPlinkoResult(serverSeed, clientSeed, nonce, risk, rows);
  const payout = Number((betAmount * outcome.multiplier).toFixed(2));
  const profit = Number((payout - betAmount).toFixed(2));

  const session = await mongoose.startSession();
  let updatedUser = null;
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id).session(session);
      if (!user || user.balance < betAmount) throw new Error('Insufficient balance');
      const balanceBefore = Number(user.balance);
      user.balance = Number((user.balance - betAmount + payout).toFixed(2));
      user.totalWagered = Number((user.totalWagered + betAmount).toFixed(2));
      if (payout > 0) user.totalWon = Number((user.totalWon + payout).toFixed(2));
      await user.save({ session });
      updatedUser = user;

      await Transaction.insertMany(
        [
          {
            userId: req.user._id,
            game: 'plinko',
            type: 'bet',
            amount: betAmount,
            balanceBefore,
            balanceAfter: Number((balanceBefore - betAmount).toFixed(2)),
            meta: { risk, rows, nonce }
          },
          {
            userId: req.user._id,
            game: 'plinko',
            type: 'payout',
            amount: payout,
            balanceBefore: Number((balanceBefore - betAmount).toFixed(2)),
            balanceAfter: Number((balanceBefore - betAmount + payout).toFixed(2)),
            meta: { risk, rows, nonce, slot: outcome.slot, multiplier: outcome.multiplier }
          }
        ],
        { session }
      );
    });
  } catch (error) {
    if (error.message === 'Insufficient balance') return res.status(400).json({ message: error.message });
    throw error;
  } finally {
    await session.endSession();
  }

  await rotateGenericSeed('plinko_server_seed');
  res.status(201).json({
    ...outcome,
    payout,
    profit,
    status: profit >= 0 ? 'won' : 'lost',
    nonce,
    hashedServerSeed,
    clientSeed,
    user: sanitizeUser(updatedUser)
  });
});

app.post('/api/towers/start', authRequired, async (req, res) => {
  const betAmount = Number(req.body?.betAmount || 0);
  const clientSeed = String(req.body?.clientSeed || `towers-client-${req.user._id}`).slice(0, 80);
  if (!Number.isFinite(betAmount) || betAmount <= 0) return res.status(400).json({ message: 'Invalid bet amount' });

  const activeExisting = await TowersGame.findOne({ userId: req.user._id, status: 'active' });
  if (activeExisting) return res.status(409).json({ message: 'Finish your active Towers game first' });

  const nonce = await getNextGenericNonce('towers_nonce_global');
  const serverSeed = await getCurrentGenericSeed('towers_server_seed');
  const serverSeedHash = hashSeed(serverSeed);
  const mineColumns = buildTowersMines(serverSeed, clientSeed, nonce);
  let createdGame = null;
  let updatedUser = null;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id).session(session);
      if (!user || user.balance < betAmount) throw new Error('Insufficient balance');
      const balanceBefore = Number(user.balance);
      user.balance = Number((user.balance - betAmount).toFixed(2));
      user.totalWagered = Number((user.totalWagered + betAmount).toFixed(2));
      await user.save({ session });
      updatedUser = user;

      createdGame = await TowersGame.create(
        [
          {
            userId: req.user._id,
            betAmount,
            currentFloor: 0,
            multiplier: 1,
            mineColumns,
            status: 'active',
            payout: 0,
            serverSeedHash,
            serverSeed,
            clientSeed,
            nonce
          }
        ],
        { session }
      );

      await Transaction.create(
        [
          {
            userId: req.user._id,
            game: 'towers',
            type: 'bet',
            amount: betAmount,
            balanceBefore,
            balanceAfter: Number((balanceBefore - betAmount).toFixed(2)),
            meta: { nonce }
          }
        ],
        { session }
      );
    });
  } catch (error) {
    if (error.message === 'Insufficient balance') return res.status(400).json({ message: error.message });
    throw error;
  } finally {
    await session.endSession();
  }

  res.status(201).json({
    gameId: String(createdGame[0]._id),
    currentFloor: 0,
    multiplier: 1,
    nonce,
    hashedServerSeed: serverSeedHash,
    clientSeed,
    user: sanitizeUser(updatedUser)
  });
});

app.get('/api/towers/active', authRequired, async (req, res) => {
  const game = await TowersGame.findOne({ userId: req.user._id, status: 'active' }).lean();
  if (!game) return res.json({ game: null });
  res.json({
    game: {
      id: String(game._id),
      betAmount: Number(game.betAmount),
      currentFloor: Number(game.currentFloor),
      multiplier: Number(game.multiplier),
      nonce: Number(game.nonce),
      hashedServerSeed: game.serverSeedHash,
      clientSeed: game.clientSeed
    }
  });
});

app.post('/api/towers/reveal', authRequired, async (req, res) => {
  const gameId = String(req.body?.gameId || '');
  const column = Number(req.body?.column);
  if (!gameId || !Number.isInteger(column) || column < 0 || column >= TOWERS_COLUMNS) {
    return res.status(400).json({ message: 'Invalid gameId or column' });
  }

  const session = await mongoose.startSession();
  let user = null;
  let game = null;
  let payout = 0;
  let triggeredMineColumn = null;
  try {
    await session.withTransaction(async () => {
      game = await TowersGame.findOne({ _id: gameId, userId: req.user._id, status: 'active' }).session(session);
      if (!game) throw new Error('Active game not found');
      const floor = Number(game.currentFloor);
      const mineCol = Number(game.mineColumns[floor]);
      if (column === mineCol) {
        triggeredMineColumn = mineCol;
        game.status = 'lost';
        game.payout = 0;
        await game.save({ session });
        return;
      }

      game.currentFloor = floor + 1;
      game.multiplier = getTowersMultiplier(game.currentFloor);

      if (game.currentFloor >= TOWERS_FLOORS) {
        payout = Number((game.betAmount * game.multiplier).toFixed(2));
        game.status = 'won';
        game.payout = payout;
        user = await User.findById(req.user._id).session(session);
        if (!user) throw new Error('User not found');
        const balanceBefore = Number(user.balance);
        user.balance = Number((user.balance + payout).toFixed(2));
        user.totalWon = Number((user.totalWon + payout).toFixed(2));
        await user.save({ session });
        await Transaction.create(
          [
            {
              userId: req.user._id,
              game: 'towers',
              type: 'payout',
              amount: payout,
              balanceBefore,
              balanceAfter: user.balance,
              meta: { gameId, result: 'full_clear', floor: game.currentFloor }
            }
          ],
          { session }
        );
      }
      await game.save({ session });
    });
  } catch (error) {
    if (error.message === 'Active game not found') return res.status(404).json({ message: error.message });
    throw error;
  } finally {
    await session.endSession();
  }

  if (game.status === 'lost') {
    await rotateGenericSeed('towers_server_seed');
  } else if (game.status === 'won') {
    await rotateGenericSeed('towers_server_seed');
  }

  res.json({
    gameId: String(game._id),
    status: game.status,
    currentFloor: Number(game.currentFloor),
    multiplier: Number(game.multiplier),
    payout: Number(game.payout || 0),
    hitMine: game.status === 'lost',
    mineColumn: game.status === 'lost' ? triggeredMineColumn : null,
    user: user ? sanitizeUser(user) : null
  });
});

app.post('/api/towers/cashout', authRequired, async (req, res) => {
  const gameId = String(req.body?.gameId || '');
  if (!gameId) return res.status(400).json({ message: 'gameId required' });

  const session = await mongoose.startSession();
  let user = null;
  let game = null;
  try {
    await session.withTransaction(async () => {
      game = await TowersGame.findOne({ _id: gameId, userId: req.user._id, status: 'active' }).session(session);
      if (!game) throw new Error('Active game not found');
      const payout = Number((game.betAmount * game.multiplier).toFixed(2));
      game.status = 'cashed_out';
      game.payout = payout;
      await game.save({ session });

      user = await User.findById(req.user._id).session(session);
      if (!user) throw new Error('User not found');
      const balanceBefore = Number(user.balance);
      user.balance = Number((user.balance + payout).toFixed(2));
      user.totalWon = Number((user.totalWon + payout).toFixed(2));
      await user.save({ session });
      await Transaction.create(
        [
          {
            userId: req.user._id,
            game: 'towers',
            type: 'payout',
            amount: payout,
            balanceBefore,
            balanceAfter: user.balance,
            meta: { gameId, result: 'cashout', floor: game.currentFloor }
          }
        ],
        { session }
      );
    });
  } catch (error) {
    if (error.message === 'Active game not found') return res.status(404).json({ message: error.message });
    throw error;
  } finally {
    await session.endSession();
  }

  await rotateGenericSeed('towers_server_seed');
  res.json({
    gameId: String(game._id),
    status: game.status,
    currentFloor: Number(game.currentFloor),
    multiplier: Number(game.multiplier),
    payout: Number(game.payout || 0),
    user: sanitizeUser(user)
  });
});

const getSeedSettingKey = (game) => {
  if (game === 'dice') return 'dice_server_seed';
  if (game === 'roulette') return 'roulette_server_seed';
  if (game === 'poker') return 'poker_server_seed';
  if (game === 'limbo') return 'limbo_server_seed';
  if (game === 'plinko') return 'plinko_server_seed';
  if (game === 'towers') return 'towers_server_seed';
  return null;
};

app.post('/api/fairness/rotate-seed', authRequired, async (req, res) => {
  const game = String(req.body?.game || '').toLowerCase();
  const settingKey = getSeedSettingKey(game);
  if (!settingKey) {
    return res.status(400).json({ message: 'Seed rotation not supported for game' });
  }

  const previous = await Setting.findOne({ key: settingKey });
  const nextSeed = crypto.randomBytes(32).toString('hex');
  await Setting.findOneAndUpdate(
    { key: settingKey },
    { key: settingKey, value: nextSeed },
    { returnDocument: 'after', upsert: true }
  );

  if (previous?.value) {
    await FairnessSeedSession.create({
      userId: req.user._id,
      game,
      serverSeed: String(previous.value),
      hashedServerSeed: hashSeed(String(previous.value)),
      clientSeed: String(req.body?.clientSeed || `client-${req.user._id}`),
      startNonce: 0,
      endNonce: 0,
      isActive: false,
      rotatedAt: new Date()
    });
  }

  res.json({ ok: true, game, hashedServerSeed: hashSeed(nextSeed) });
});

app.post('/api/fairness/verify', authRequired, async (req, res) => {
  const game = String(req.body?.game || '').toLowerCase();
  const serverSeed = String(req.body?.serverSeed || '');
  const clientSeed = String(req.body?.clientSeed || '');
  const nonce = Number(req.body?.nonce ?? -1);

  if (!serverSeed || !clientSeed || nonce < 0) {
    return res.status(400).json({ message: 'serverSeed, clientSeed, nonce required' });
  }

  const hash = hashSeed(`${serverSeed}:${clientSeed}:${nonce}`);
  const unit = parseInt(hash.slice(0, 13), 16) / 2 ** 52;

  let result = null;
  if (game === 'dice') {
    result = { roll: Number((Math.floor(unit * 10000) / 100).toFixed(2)) };
  } else if (game === 'roulette') {
    const winningNumber = Math.floor(unit * 37);
    result = { winningNumber, color: getRouletteColor(winningNumber) };
  } else if (game === 'poker') {
    const deck = buildPokerShuffledDeck(serverSeed, clientSeed, nonce);
    const hand = deck.slice(0, 5);
    const evaluated = evaluatePokerHand(hand);
    result = { hand, handRank: evaluated.rank, multiplier: evaluated.multiplier };
  } else if (game === 'crash') {
    result = { crashPoint: buildCrashPoint(serverSeed, clientSeed, nonce) };
  } else if (game === 'mines') {
    const tileCount = Number(req.body?.tileCount || 25);
    const mineCount = Number(req.body?.mineCount || 3);
    const picks = [];
    const used = new Set();
    let cursor = 0;
    while (picks.length < mineCount && picks.length < tileCount) {
      const chunk = hash.slice(cursor, cursor + 4);
      cursor = (cursor + 4) % (hash.length - 4);
      const pick = parseInt(chunk, 16) % tileCount;
      if (!used.has(pick)) {
        used.add(pick);
        picks.push(pick);
      }
    }
    result = { mines: picks.sort((a, b) => a - b) };
  } else if (game === 'limbo') {
    result = { resultMultiplier: buildLimboResult(serverSeed, clientSeed, nonce) };
  } else if (game === 'plinko') {
    const risk = String(req.body?.risk || 'medium').toLowerCase();
    const rows = Number(req.body?.rows || 12);
    result = buildPlinkoResult(serverSeed, clientSeed, nonce, risk, rows);
  } else if (game === 'towers') {
    result = { mineColumns: buildTowersMines(serverSeed, clientSeed, nonce) };
  } else {
    return res.status(400).json({ message: 'Unsupported game verify adapter' });
  }

  await FairnessVerificationLog.create({
    userId: req.user._id,
    game,
    input: { clientSeed, nonce, hashInput: `${serverSeed}:${clientSeed}:${nonce}` },
    result: { ...result, hashedServerSeed: hashSeed(serverSeed) }
  });

  res.json({ game, ...result, hashedServerSeed: hashSeed(serverSeed), nonce, clientSeed });
});

app.get('/api/fairness/history', authRequired, async (req, res) => {
  const game = String(req.query?.game || '').toLowerCase();
  const filter = { userId: req.user._id };
  if (game) filter.game = game;

  const rows = await FairnessVerificationLog.find(filter).sort({ createdAt: -1 }).limit(150).lean();
  res.json({
    history: rows.map((row) => ({
      id: String(row._id),
      game: row.game,
      nonce: row.input?.nonce ?? null,
      resultSummary: JSON.stringify(row.result),
      createdAt: row.createdAt
    }))
  });
});

if (SERVE_STATIC) {
  app.get(/^\/(?!api).*/, (_req, res, next) => {
    const indexPath = path.join(DIST_DIR, 'index.html');
    if (!fs.existsSync(indexPath)) return next();
    return res.sendFile(indexPath);
  });
}

app.use(async (err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const actor = req.user?.username || 'guest';
  const actorRole = req.user?.role || 'guest';

  await audit({
    level: 'error',
    action: 'request.error',
    actor,
    actorRole,
    target: req.originalUrl,
    meta: { method: req.method, message: err.message, statusCode }
  });

  console.error(`[API ERROR] ${req.method} ${req.originalUrl}`, err.message);
  res.status(statusCode).json({ message: err.message || 'Internal server error' });
});

async function connectDatabaseWithRetry() {
  while (!dbReady) {
    try {
      await mongoose.connect(MONGODB_URI);
      dbReady = true;
      console.log('Connected to primary MongoDB URI');
      break;
    } catch (primaryError) {
      console.error(`Primary MongoDB connection failed: ${primaryError.message}`);
      if (!USE_MONGODB_FALLBACK) {
        console.log(`Retrying primary MongoDB URI in ${DB_RETRY_MS}ms`);
        await new Promise((resolve) => setTimeout(resolve, DB_RETRY_MS));
        continue;
      }
      try {
        console.log(`Trying fallback MongoDB URI: ${MONGODB_URI_FALLBACK}`);
        await mongoose.connect(MONGODB_URI_FALLBACK);
        dbReady = true;
        console.log('Connected to fallback MongoDB URI');
        break;
      } catch (fallbackError) {
        console.error(`Fallback MongoDB connection failed: ${fallbackError.message}`);
        console.log(`Retrying MongoDB connection in ${DB_RETRY_MS}ms`);
        await new Promise((resolve) => setTimeout(resolve, DB_RETRY_MS));
      }
    }
  }
}

async function initializeServices() {
  await connectDatabaseWithRetry();
  if (!servicesInitialized) {
    await seedDefaults();
    scheduleNextCrashRound();
    servicesInitialized = true;
  }
}

async function start() {
  app.listen(PORT, () => {
    console.log(`API server listening on port ${PORT}`);
  });
  await initializeServices();
}

start().catch((error) => {
  console.error('Failed to initialize services', error);
});
