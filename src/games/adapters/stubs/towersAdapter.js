const towersAdapter = {
  gameId: 'towers',
  gameName: 'Towers Terminal',
  supportsAutoBet: true,
  supportsAutoCashout: true,
  calculateRisk({ state = {} }) {
    const floor = Number(state?.currentFloor || 0);
    if (floor >= 6) return 'extreme';
    if (floor >= 4) return 'high';
    if (floor >= 2) return 'medium';
    return 'low';
  },
  getPayoutPreview({ betAmount = 0, state = {} }) {
    const multiplier = Number(state?.multiplier || 1);
    const payout = Number((betAmount * multiplier).toFixed(2));
    return {
      payout,
      profit: Number((payout - betAmount).toFixed(2))
    };
  }
};

export default towersAdapter;
