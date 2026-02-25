const minesAdapter = {
  gameId: 'mines',
  gameName: 'Mines Terminal',
  supportsAutoBet: true,
  supportsAutoCashout: true,
  calculateRisk({ state }) {
    const mineCount = Number(state?.mineCount || 3);
    if (mineCount <= 3) return 'low';
    if (mineCount <= 6) return 'medium';
    if (mineCount <= 10) return 'high';
    return 'extreme';
  }
};

export default minesAdapter;
