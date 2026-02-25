import crypto from 'crypto';

type FairBoardInput = {
  gridSize: number;
  mineCount: number;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
};

function toDeterministicFloat(seed: string) {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  const intValue = Number.parseInt(hash.slice(0, 13), 16);
  return intValue / 0x1fffffffffffff;
}

export function hashServerSeed(serverSeed: string) {
  return crypto.createHash('sha256').update(serverSeed).digest('hex');
}

export function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

export function generateMinesPositions(input: FairBoardInput) {
  const { gridSize, mineCount, serverSeed, clientSeed, nonce } = input;
  const tileCount = gridSize * gridSize;

  const indexes = Array.from({ length: tileCount }, (_, i) => i);
  const mines: number[] = [];

  let round = 0;
  while (mines.length < mineCount) {
    const source = `${serverSeed}:${clientSeed}:${nonce}:${round}`;
    const random = toDeterministicFloat(source);
    const pick = Math.floor(random * indexes.length);
    const selected = indexes.splice(pick, 1)[0];
    mines.push(selected);
    round += 1;
  }

  return mines.sort((a, b) => a - b);
}

export function verifyBoard(input: FairBoardInput & { expectedMines: number[] }) {
  const computed = generateMinesPositions(input);
  if (computed.length !== input.expectedMines.length) return false;
  return computed.every((value, idx) => value === input.expectedMines[idx]);
}
