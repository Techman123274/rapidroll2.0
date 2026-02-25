import { useState } from 'react';
import Card from '../../components/ui/Card';
import FairnessPanel from '../../components/fairness/FairnessPanel';
import BetTerminal from '../../components/bet-terminal/BetTerminal';
import limboAdapter from '../adapters/stubs/limboAdapter';
import { api } from '../../services/api';

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

function LimboVault({ isGameDisabled, userBalance, token, syncUser }) {
  const [bet, setBet] = useState(10);
  const [target, setTarget] = useState(2);
  const [status, setStatus] = useState('Set target multiplier and play.');
  const [result, setResult] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [sessionProfit, setSessionProfit] = useState(0);
  const [totalWagered, setTotalWagered] = useState(0);
  const [betsCount, setBetsCount] = useState(0);
  const [fairnessState, setFairnessState] = useState({
    clientSeed: 'limbo-client-seed',
    nonce: 0,
    hashedServerSeed: ''
  });

  const onPlay = async () => {
    if (isBusy || isGameDisabled || !token) return;
    if (bet <= 0 || bet > userBalance) {
      setStatus('Invalid bet or insufficient balance.');
      return;
    }
    if (target < 1.01 || target > 1000) {
      setStatus('Target must be between 1.01x and 1000x.');
      return;
    }

    setIsBusy(true);
    try {
      const data = await api.playLimbo(token, {
        betAmount: Number(bet),
        target: Number(target),
        clientSeed: fairnessState.clientSeed
      });
      setResult(data);
      setStatus(
        data.status === 'won'
          ? `Hit ${data.resultMultiplier.toFixed(2)}x, target ${Number(target).toFixed(2)}x won.`
          : `Hit ${data.resultMultiplier.toFixed(2)}x, target ${Number(target).toFixed(2)}x missed.`
      );
      syncUser?.(data.user);
      setSessionProfit((prev) => Number((prev + Number(data.profit || 0)).toFixed(2)));
      setTotalWagered((prev) => Number((prev + Number(bet)).toFixed(2)));
      setBetsCount((prev) => prev + 1);
      setFairnessState((prev) => ({
        ...prev,
        nonce: data.nonce || 0,
        hashedServerSeed: data.hashedServerSeed || ''
      }));
    } catch (error) {
      setStatus(error.message || 'Play failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const winChance = Number((99 / Math.max(1.01, target)).toFixed(2));

  return (
    <Card className="game-play-card">
      <header className="page-header">
        <h2>Limbo Vault</h2>
        <p>{status}</p>
      </header>

      <section className="wallet-grid">
        <Card>
          <h3>Result Multiplier</h3>
          <p className="wallet-value">{result ? `${Number(result.resultMultiplier).toFixed(2)}x` : '--'}</p>
        </Card>
        <Card>
          <h3>Target</h3>
          <p className="wallet-value">{target.toFixed(2)}x</p>
        </Card>
        <Card>
          <h3>Win Chance</h3>
          <p className="wallet-value">{winChance.toFixed(2)}%</p>
        </Card>
      </section>

      <section className="dice-rush-main">
        <aside className="dice-controls-card">
          <BetTerminal
            adapter={limboAdapter}
            betAmount={bet}
            balance={userBalance}
            state={{ target }}
            minBet={0.01}
            maxBet={1_000_000}
            disabled={isBusy || isGameDisabled}
            onBetAmountChange={setBet}
            action={{
              label: isBusy ? 'Playing...' : 'Play Limbo',
              onClick: () => void onPlay(),
              disabled: isBusy || isGameDisabled
            }}
            customFields={() => (
              <label className="bt-field">
                Target (x)
                <input
                  type="number"
                  min="1.01"
                  max="1000"
                  step="0.01"
                  value={target}
                  disabled={isBusy}
                  onChange={(event) => setTarget(Math.max(1.01, Math.min(1000, Number(event.target.value) || 1.01)))}
                />
              </label>
            )}
            stats={{
              sessionPL: sessionProfit,
              totalWagered,
              lastPayout: Number(result?.payout || 0),
              betsCount
            }}
          />
        </aside>

        <section className="dice-auto-panel">
          <FairnessPanel
            token={token}
            game="limbo"
            fairnessState={fairnessState}
            onClientSeedChange={(value) => setFairnessState((prev) => ({ ...prev, clientSeed: value }))}
            onRotateSeed={async () => {
              const data = await api.rotateFairnessSeed(token, 'limbo', fairnessState.clientSeed);
              setFairnessState((prev) => ({
                ...prev,
                hashedServerSeed: data.hashedServerSeed || prev.hashedServerSeed
              }));
            }}
          />
        </section>
      </section>
    </Card>
  );
}

export default LimboVault;
