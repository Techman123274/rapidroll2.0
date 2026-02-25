import { deriveRiskFromRatio } from '../../components/bet-terminal/betTerminalUtils';

const diceAdapter = {
  gameId: 'dice',
  gameName: 'Dice Rush Terminal',
  supportsAutoBet: true,
  supportsAutoCashout: false,
  calculateRisk({ betAmount = 0, balance = 0, state = {} }) {
    const target = Number(state?.target || 50);
    const base = deriveRiskFromRatio(balance > 0 ? betAmount / balance : 1);
    if (target <= 20 || target >= 80) return 'high';
    return base;
  },
  getPayoutPreview({ betAmount = 0, state = {} }) {
    const target = Number(state?.target || 50);
    const mode = state?.mode || 'under';
    const winChance = mode === 'under' ? target : 100 - target;
    const multiplier = 99 / Math.max(1, winChance);
    const payout = Number((betAmount * multiplier).toFixed(2));
    return { payout, profit: Number((payout - betAmount).toFixed(2)) };
  }
};

export default diceAdapter;
