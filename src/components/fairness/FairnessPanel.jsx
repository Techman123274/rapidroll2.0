import { useEffect, useState } from 'react';
import SeedControls from './SeedControls';
import FairnessHistoryTable from './FairnessHistoryTable';
import VerifyResultCard from './VerifyResultCard';
import { api } from '../../services/api';

function FairnessPanel({ token, game, fairnessState, onClientSeedChange, onRotateSeed }) {
  const [verifyJson, setVerifyJson] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);

  useEffect(() => {
    async function loadHistory() {
      try {
        const data = await api.getFairnessHistory(token, game);
        setHistoryRows(data.history || []);
      } catch {
        setHistoryRows([]);
      }
    }
    if (game) {
      void loadHistory();
    }
  }, [game, token]);

  const verify = async () => {
    try {
      const payload = JSON.parse(verifyJson || '{}');
      const result = await api.verifyFairness(token, game, payload);
      setVerifyResult(result);
    } catch (error) {
      setVerifyResult({ error: error.message || 'Invalid JSON or verify failed' });
    }
  };

  return (
    <section className="fairness-panel">
      <div className="fairness-head">
        <h3>Provably Fair</h3>
        <p>serverSeed hash + clientSeed + nonce verification</p>
      </div>

      <SeedControls
        clientSeed={fairnessState?.clientSeed || ''}
        nonce={fairnessState?.nonce || 0}
        hashedServerSeed={fairnessState?.hashedServerSeed || ''}
        onClientSeedChange={onClientSeedChange || (() => {})}
        onRotate={onRotateSeed}
      />

      <div className="fairness-verify-box">
        <label>
          Verify Payload (JSON)
          <textarea value={verifyJson} onChange={(event) => setVerifyJson(event.target.value)} placeholder='{"serverSeed":"...","clientSeed":"...","nonce":1}' />
        </label>
        <button type="button" className="btn btn-outline" onClick={verify}>
          Verify
        </button>
      </div>

      <VerifyResultCard result={verifyResult} />
      <FairnessHistoryTable rows={historyRows} />
    </section>
  );
}

export default FairnessPanel;
