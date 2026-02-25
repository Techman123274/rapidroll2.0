function VerifyResultCard({ result }) {
  if (!result) return null;
  return (
    <div className="fairness-verify-result">
      <h4>Verification Result</h4>
      <pre>{JSON.stringify(result, null, 2)}</pre>
    </div>
  );
}

export default VerifyResultCard;
