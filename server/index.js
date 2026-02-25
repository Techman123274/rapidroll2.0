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
    lastDailyClaimedAt: { type: Date, default: null }
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
    usesRemaining: { type: Number, default: 0 }
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
    type: { type: String, enum: ['bet', 'payout', 'daily_claim', 'deposit', 'withdraw'], required: true },
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

const PLINKO_ROWS = 12;
const PLINKO_MULTIPLIERS = {
  low: [0.5, 0.7, 0.9, 1, 1.1, 1.3, 1.5, 1.3, 1.1, 1, 0.9, 0.7, 0.5],
  medium: [0.2, 0.4, 0.6, 0.9, 1.2, 1.8, 3, 1.8, 1.2, 0.9, 0.6, 0.4, 0.2],
  high: [0.1, 0.2, 0.4, 0.8, 1.5, 3, 8, 3, 1.5, 0.8, 0.4, 0.2, 0.1]
};

const buildPlinkoResult = (serverSeed, clientSeed, nonce, risk = 'medium') => {
  const digest = hashSeed(`${serverSeed}:${clientSeed}:${nonce}`);
  let rights = 0;
  for (let i = 0; i < PLINKO_ROWS; i += 1) {
    const nibble = parseInt(digest[i], 16);
    rights += nibble % 2;
  }
  const multipliers = PLINKO_MULTIPLIERS[risk] || PLINKO_MULTIPLIERS.medium;
  return {
    slot: rights,
    multiplier: Number((multipliers[rights] || 0).toFixed(4)),
    risk,
    rows: PLINKO_ROWS
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

  const promoCount = await Promotion.countDocuments();
  if (promoCount === 0) {
    await Promotion.insertMany([
      {
        title: 'Weekly Rakeback',
        description: 'Automatic weekly cashback based on your activity.',
        image: '/site/promo-rakeback.svg',
        path: '/wallet',
        cta: 'Claim Cashback',
        badge: 'Cashback'
      },
      {
        title: 'Reload Bonus',
        description: 'Boost your next deposit with a limited-time reload.',
        image: '/site/promo-reload.svg',
        path: '/wallet',
        cta: 'Deposit Now',
        badge: 'Reload'
      },
      {
        title: 'Race Leaderboard',
        description: 'Earn points from every wager and climb the weekly rankings.',
        image: '/site/promo-race.svg',
        path: '/vip',
        cta: 'Join Race',
        badge: 'Competitive'
      }
    ]);
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

app.get('/api/public/state', async (_req, res) => {
  const [promotions, games, globalMessages, siteSetting] = await Promise.all([
    Promotion.find().sort({ createdAt: -1 }).lean(),
    Game.find().sort({ title: 1 }).lean(),
    Message.find({ channel: 'global' }).sort({ createdAt: 1 }).limit(150).lean(),
    Setting.findOne({ key: 'site_online' }).lean()
  ]);

  res.json({
    promotions,
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

  const payload = {
    promotions,
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
  const { name, title, description, image, badge, cta, path, amount, uses } = req.body || {};
  const normalizedName = String(name || title || '').trim();
  const normalizedTitle = String(title || name || '').trim();
  const normalizedDescription = String(description || '').trim();
  const normalizedAmount = Number(amount || 0);
  const normalizedUses = Math.max(0, Math.floor(Number(uses || 0)));

  if (!normalizedName || !normalizedDescription) {
    return res.status(400).json({ message: 'name and description are required' });
  }
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
    return res.status(400).json({ message: 'amount must be a positive number' });
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
    usesRemaining: normalizedUses
  });
  await audit({
    action: 'promotion.create',
    actor: req.user.username,
    actorRole: req.user.role,
    target: String(promotion._id),
    meta: { title: promotion.title }
  });

  res.status(201).json(promotion);
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
  const clientSeed = String(req.body?.clientSeed || `plinko-client-${req.user._id}`).slice(0, 80);
  if (!Number.isFinite(betAmount) || betAmount <= 0) return res.status(400).json({ message: 'Invalid bet amount' });
  if (!['low', 'medium', 'high'].includes(risk)) return res.status(400).json({ message: 'Invalid risk' });

  const nonce = await getNextGenericNonce('plinko_nonce_global');
  const serverSeed = await getCurrentGenericSeed('plinko_server_seed');
  const hashedServerSeed = hashSeed(serverSeed);
  const outcome = buildPlinkoResult(serverSeed, clientSeed, nonce, risk);
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
            meta: { risk, nonce }
          },
          {
            userId: req.user._id,
            game: 'plinko',
            type: 'payout',
            amount: payout,
            balanceBefore: Number((balanceBefore - betAmount).toFixed(2)),
            balanceAfter: Number((balanceBefore - betAmount + payout).toFixed(2)),
            meta: { risk, nonce, slot: outcome.slot, multiplier: outcome.multiplier }
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
    result = buildPlinkoResult(serverSeed, clientSeed, nonce, risk);
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
