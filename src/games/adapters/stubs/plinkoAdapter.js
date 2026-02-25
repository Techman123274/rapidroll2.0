const plinkoAdapter = {
  gameId: 'plinko',
  gameName: 'Plinko Terminal',
  supportsAutoBet: true,
  supportsAutoCashout: false,
  calculateRisk({ state = {} }) {
    const risk = String(state?.risk || 'medium');
    if (risk === 'high') return 'high';
    if (risk === 'low') return 'low';
    return 'medium';
  },
  getPayoutPreview({ betAmount = 0, state = {} }) {
    const risk = String(state?.risk || 'medium');
    const baseline = risk === 'high' ? 0.2 : risk === 'low' ? 0.9 : 0.6;
    const payout = Number((betAmount * baseline).toFixed(2));
    return {
      payout,
      profit: Number((payout - betAmount).toFixed(2))
    };
  }
};

export default plinkoAdapter;
