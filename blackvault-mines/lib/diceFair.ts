import crypto from 'crypto';

export function hashSeed(seed: string) {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

export function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

export function generateDiceRoll(params: { serverSeed: string; clientSeed: string; nonce: number }) {
  const { serverSeed, clientSeed, nonce } = params;
  const source = `${serverSeed}:${clientSeed}:${nonce}:dice`;
  const hash = hashSeed(source);
  const intValue = Number.parseInt(hash.slice(0, 13), 16);
  const normalized = intValue / 0x1fffffffffffff;
  const roll = Number((normalized * 100).toFixed(2));
  return Math.min(99.99, Math.max(0, roll));
}

export function calculateWinChance(target: number, isOver: boolean) {
  return Number((isOver ? 100 - target : target).toFixed(4));
}

export function calculateDiceMultiplier(winChance: number, houseEdge = 0.01) {
  if (winChance <= 0) throw new Error('INVALID_WIN_CHANCE');
  return Number(((100 / winChance) * (1 - houseEdge)).toFixed(6));
}

export function isDiceWin(roll: number, target: number, isOver: boolean) {
  return isOver ? roll > target : roll < target;
}
