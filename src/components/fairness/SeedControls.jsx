function SeedControls({ clientSeed, nonce, hashedServerSeed, onClientSeedChange, onRotate }) {
  return (
    <div className="fairness-seeds">
      <label>
        Client Seed
        <input type="text" value={clientSeed} onChange={(event) => onClientSeedChange(event.target.value)} />
      </label>
      <p>
        <span>Hashed Server Seed</span>
        <code>{hashedServerSeed || 'N/A'}</code>
      </p>
      <p>
        <span>Nonce</span>
        <strong>{nonce ?? 0}</strong>
      </p>
      {onRotate ? (
        <button type="button" className="btn btn-outline" onClick={onRotate}>
          Rotate Seed
        </button>
      ) : null}
    </div>
  );
}

export default SeedControls;
