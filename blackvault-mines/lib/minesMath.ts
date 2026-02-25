const DEFAULT_HOUSE_EDGE = Number(process.env.HOUSE_EDGE || 0.01);

function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= kk; i += 1) {
    result = (result * (n - kk + i)) / i;
  }
  return result;
}

export function calculateMultiplier(params: {
  gridSize: number;
  mineCount: number;
  revealedTiles: number;
  houseEdge?: number;
}) {
  const { gridSize, mineCount, revealedTiles } = params;
  const houseEdge = params.houseEdge ?? DEFAULT_HOUSE_EDGE;

  const totalTiles = gridSize * gridSize;
  const safeTiles = totalTiles - mineCount;

  if (revealedTiles <= 0) return 1;
  if (revealedTiles > safeTiles) {
    throw new Error('revealedTiles exceeds safe tile count');
  }

  const survivalProbability =
    combination(safeTiles, revealedTiles) / combination(totalTiles, revealedTiles);
  const fairMultiplier = 1 / survivalProbability;
  return Number((fairMultiplier * (1 - houseEdge)).toFixed(6));
}

export function calculatePotentialWin(betAmount: number, multiplier: number) {
  return Number((betAmount * multiplier).toFixed(2));
}

export function riskLabel(mineCount: number, gridSize: number): 'Low' | 'Medium' | 'High' | 'Extreme' {
  const ratio = mineCount / (gridSize * gridSize);
  if (ratio <= 0.12) return 'Low';
  if (ratio <= 0.25) return 'Medium';
  if (ratio <= 0.4) return 'High';
  return 'Extreme';
}
