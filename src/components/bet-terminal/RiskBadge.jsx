function RiskBadge({ risk = 'low' }) {
  return <span className={`bt-risk-badge risk-${risk}`}>Risk: {risk}</span>;
}

export default RiskBadge;
