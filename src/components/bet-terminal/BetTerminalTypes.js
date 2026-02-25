/**
 * @typedef {'low'|'medium'|'high'|'extreme'} BetRisk
 * @typedef {{ label: string, key: string, value: number|'max'|'double'|'half' }} QuickControl
 * @typedef {{
 *  gameId: string,
 *  gameName: string,
 *  supportsAutoBet?: boolean,
 *  supportsAutoCashout?: boolean,
 *  quickControls?: QuickControl[],
 *  calculateRisk?: (state: any) => BetRisk,
 *  validate?: (state: any) => string|null,
 *  getPayoutPreview?: (state: any) => { payout: number, profit: number }
 * }} BetTerminalAdapter
 */

export const DEFAULT_QUICK_CONTROLS = [
  { label: '+1', key: 'plus1', value: 1 },
  { label: '+5', key: 'plus5', value: 5 },
  { label: '+10', key: 'plus10', value: 10 },
  { label: '/2', key: 'half', value: 'half' },
  { label: 'x2', key: 'double', value: 'double' },
  { label: 'Max', key: 'max', value: 'max' }
];
