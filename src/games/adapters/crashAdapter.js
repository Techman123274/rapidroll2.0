const crashAdapter = {
  gameId: 'crash',
  gameName: 'Orbit Crash Terminal',
  supportsAutoBet: true,
  supportsAutoCashout: true,
  calculateRisk({ state }) {
    const cashout = Number(state?.autoCashoutAt || 1.5);
    if (cashout <= 1.5) return 'low';
    if (cashout <= 2.5) return 'medium';
    if (cashout <= 5) return 'high';
    return 'extreme';
  }
};

export default crashAdapter;
