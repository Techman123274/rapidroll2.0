import { deriveRiskFromRatio } from '../../../components/bet-terminal/betTerminalUtils';

const limboAdapter = {
  gameId: 'limbo',
  gameName: 'Limbo Terminal',
  supportsAutoBet: true,
  supportsAutoCashout: false,
  calculateRisk({ betAmount = 0, balance = 0, state = {} }) {
    const target = Number(state?.target || 2);
    if (target >= 10) return 'extreme';
    if (target >= 4) return 'high';
    return deriveRiskFromRatio(balance > 0 ? betAmount / balance : 1);
  },
  getPayoutPreview({ betAmount = 0, state = {} }) {
    const target = Number(state?.target || 2);
    const payout = Number((betAmount * target).toFixed(2));
    return {
      payout,
      profit: Number((payout - betAmount).toFixed(2))
    };
  }
};

export default limboAdapter;
