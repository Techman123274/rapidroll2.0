const plinkoAdapter = {
  gameId: 'plinko',
  gameName: 'Plinko Terminal',
  supportsAutoBet: true,
  supportsAutoCashout: false,
  calculateRisk({ state = {} }) {
    const risk = String(state?.risk || 'medium');
    if (risk === 'extreme') return 'extreme';
    if (risk === 'high') return 'high';
    if (risk === 'low') return 'low';
    return 'medium';
  },
  getPayoutPreview({ betAmount = 0, state = {} }) {
    const risk = String(state?.risk || 'medium');
    const rows = Number(state?.rows || 12);
    const rowFactor = rows >= 14 ? 1.08 : rows <= 10 ? 0.92 : 1;
    const baseline =
      risk === 'extreme' ? 0.42 * rowFactor : risk === 'high' ? 0.56 * rowFactor : risk === 'low' ? 0.96 : 0.74;
    const payout = Number((betAmount * baseline).toFixed(2));
    return {
      payout,
      profit: Number((payout - betAmount).toFixed(2))
    };
  }
};

export default plinkoAdapter;
