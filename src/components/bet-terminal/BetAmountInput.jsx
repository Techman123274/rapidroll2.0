function BetAmountInput({ value, minBet = 0.01, maxBet = 1_000_000, disabled, onChange }) {
  return (
    <label className="bt-field">
      Bet Amount
      <input
        type="number"
        min={minBet}
        max={maxBet}
        step="0.01"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) || minBet)}
      />
    </label>
  );
}

export default BetAmountInput;
