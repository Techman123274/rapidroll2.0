import { sha256Hex } from './hash';
import { buildHashInput, hashToUnitInterval } from './randomExtract';

export async function verifyDiceOutcome({ serverSeed, clientSeed, nonce }) {
  const hash = await sha256Hex(buildHashInput(serverSeed, clientSeed, nonce));
  const unit = hashToUnitInterval(hash);
  const roll = Number((Math.floor(unit * 10000) / 100).toFixed(2));
  return { hash, roll };
}

export async function verifyRouletteOutcome({ serverSeed, clientSeed, nonce }) {
  const hash = await sha256Hex(buildHashInput(serverSeed, clientSeed, nonce));
  const unit = hashToUnitInterval(hash);
  return { hash, winningNumber: Math.floor(unit * 37) };
}

export async function verifyCrashOutcome({ serverSeed, clientSeed, nonce }) {
  const hash = await sha256Hex(buildHashInput(serverSeed, clientSeed, nonce));
  const unit = hashToUnitInterval(hash);
  if (unit < 0.01) return { hash, crashPoint: 1 };
  const crashPoint = Math.floor(1000 * (0.99 / (1 - unit))) / 100;
  return { hash, crashPoint: Number(Math.min(1000, Math.max(1, crashPoint)).toFixed(2)) };
}

export async function verifyMinesOutcome({ serverSeed, clientSeed, nonce, tileCount = 25, mineCount = 3 }) {
  const hash = await sha256Hex(buildHashInput(serverSeed, clientSeed, nonce));
  const picks = [];
  const used = new Set();
  let cursor = 0;

  while (picks.length < mineCount && picks.length < tileCount) {
    const chunk = hash.slice(cursor, cursor + 4);
    cursor = (cursor + 4) % (hash.length - 4);
    const value = parseInt(chunk, 16) % tileCount;
    if (!used.has(value)) {
      used.add(value);
      picks.push(value);
    }
  }

  return { hash, mines: picks.sort((a, b) => a - b) };
}
