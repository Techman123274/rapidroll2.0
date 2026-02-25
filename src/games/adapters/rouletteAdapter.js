const rouletteAdapter = {
  gameId: 'roulette',
  gameName: 'Roulette Pro Terminal',
  supportsAutoBet: true,
  supportsAutoCashout: false,
  calculateRisk({ state }) {
    const outsideOnly = Boolean(state?.outsideOnly);
    return outsideOnly ? 'medium' : 'high';
  }
};

export default rouletteAdapter;
