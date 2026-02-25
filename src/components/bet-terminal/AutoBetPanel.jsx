function AutoBetPanel({ enabled, config, onToggle, onChange, disabled }) {
  return (
    <div className="bt-auto-panel">
      <label className="bt-check">
        <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} disabled={disabled} />
        Auto Bet
      </label>

      <div className="bt-auto-grid">
        <label>
          Rounds
          <input
            type="number"
            min="0"
            step="1"
            value={config.rounds}
            disabled={!enabled || disabled}
            onChange={(event) => onChange('rounds', Math.max(0, Number(event.target.value) || 0))}
          />
        </label>
        <label>
          Increase On Loss %
          <input
            type="number"
            min="0"
            step="1"
            value={config.increaseOnLoss}
            disabled={!enabled || disabled}
            onChange={(event) => onChange('increaseOnLoss', Math.max(0, Number(event.target.value) || 0))}
          />
        </label>
        <label className="bt-check">
          <input
            type="checkbox"
            checked={config.resetOnWin}
            disabled={!enabled || disabled}
            onChange={(event) => onChange('resetOnWin', event.target.checked)}
          />
          Reset On Win
        </label>
        <label>
          Stop Loss
          <input
            type="number"
            min="0"
            step="1"
            value={config.stopLoss}
            disabled={!enabled || disabled}
            onChange={(event) => onChange('stopLoss', Math.max(0, Number(event.target.value) || 0))}
          />
        </label>
        <label>
          Stop Profit
          <input
            type="number"
            min="0"
            step="1"
            value={config.stopProfit}
            disabled={!enabled || disabled}
            onChange={(event) => onChange('stopProfit', Math.max(0, Number(event.target.value) || 0))}
          />
        </label>
      </div>
    </div>
  );
}

export default AutoBetPanel;
