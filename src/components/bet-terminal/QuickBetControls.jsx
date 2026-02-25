function QuickBetControls({ controls, onApply, disabled }) {
  return (
    <div className="bt-quick-controls">
      {controls.map((control) => (
        <button key={control.key} type="button" onClick={() => onApply(control.value)} disabled={disabled}>
          {control.label}
        </button>
      ))}
    </div>
  );
}

export default QuickBetControls;
