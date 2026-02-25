import { DEFAULT_QUICK_CONTROLS } from './BetTerminalTypes';

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function applyQuickAction(currentBet, actionValue, { minBet = 0.01, maxBet = 1_000_000, balance = 0 }) {
  const safeBet = Number(currentBet || 0);
  if (actionValue === 'half') return Number(clamp(safeBet / 2, minBet, maxBet).toFixed(2));
  if (actionValue === 'double') return Number(clamp(safeBet * 2, minBet, maxBet).toFixed(2));
  if (actionValue === 'max') return Number(clamp(balance, minBet, maxBet).toFixed(2));
  return Number(clamp(safeBet + Number(actionValue || 0), minBet, maxBet).toFixed(2));
}

export function getQuickControls(adapterQuickControls) {
  return Array.isArray(adapterQuickControls) && adapterQuickControls.length > 0
    ? adapterQuickControls
    : DEFAULT_QUICK_CONTROLS;
}

export function deriveRiskFromRatio(ratio = 0) {
  if (ratio <= 0.2) return 'low';
  if (ratio <= 0.45) return 'medium';
  if (ratio <= 0.7) return 'high';
  return 'extreme';
}
