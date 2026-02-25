function FairnessHistoryTable({ rows }) {
  return (
    <div className="fairness-history-table">
      <div className="fairness-history-head">
        <span>Game</span>
        <span>Nonce</span>
        <span>Result</span>
        <span>At</span>
      </div>
      <div className="fairness-history-body">
        {rows.map((row, idx) => (
          <div key={`${row.id || idx}-${idx}`} className="fairness-history-row">
            <span>{row.game}</span>
            <span>{row.nonce}</span>
            <span>{row.resultSummary}</span>
            <span>{new Date(row.createdAt || Date.now()).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FairnessHistoryTable;
