import { useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import FairnessPanel from '../../components/fairness/FairnessPanel';
import BetTerminal from '../../components/bet-terminal/BetTerminal';
import plinkoAdapter from '../adapters/stubs/plinkoAdapter';
import { api } from '../../services/api';

const SLOT_COUNT = 13;
const PEG_ROWS = 9;

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function PlinkoDrop({ isGameDisabled, userBalance, token, syncUser }) {
  const [bet, setBet] = useState(10);
  const [risk, setRisk] = useState('medium');
  const [ballsToDrop, setBallsToDrop] = useState(1);
  const [result, setResult] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState('Choose risk and drop.');
  const [sessionProfit, setSessionProfit] = useState(0);
  const [totalWagered, setTotalWagered] = useState(0);
  const [betsCount, setBetsCount] = useState(0);
  const [recentDrops, setRecentDrops] = useState([]);
  const [animatedBalls, setAnimatedBalls] = useState([]);
  const [fairnessState, setFairnessState] = useState({
    clientSeed: 'plinko-client-seed',
    nonce: 0,
    hashedServerSeed: ''
  });

  const riskClass = `plinko-risk-${risk}`;

  const slotHeat = useMemo(() => {
    const counts = Array.from({ length: SLOT_COUNT }, () => 0);
    recentDrops.forEach((drop) => {
      if (drop.slot >= 0 && drop.slot < SLOT_COUNT) counts[drop.slot] += 1;
    });
    const max = Math.max(1, ...counts);
    return counts.map((count) => count / max);
  }, [recentDrops]);

  const runSingleDrop = async (index, total) => {
    const data = await api.dropPlinko(token, {
      betAmount: Number(bet),
      risk,
      clientSeed: fairnessState.clientSeed
    });

    const ballId = `${Date.now()}-${index}`;
    const targetPercent = (Number(data.slot) / (SLOT_COUNT - 1)) * 100;

    setAnimatedBalls((prev) => [
      ...prev,
      {
        id: ballId,
        targetPercent,
        slot: Number(data.slot),
        multiplier: Number(data.multiplier),
        status: data.status
      }
    ]);

    setTimeout(() => {
      setAnimatedBalls((prev) => prev.filter((ball) => ball.id !== ballId));
    }, 1600);

    setResult(data);
    syncUser?.(data.user);
    setSessionProfit((prev) => Number((prev + Number(data.profit || 0)).toFixed(2)));
    setTotalWagered((prev) => Number((prev + Number(bet)).toFixed(2)));
    setBetsCount((prev) => prev + 1);
    setStatus(
      total > 1
        ? `Dropped ${index + 1}/${total} • slot ${data.slot} • ${Number(data.multiplier).toFixed(2)}x`
        : `Slot ${data.slot}, multiplier ${Number(data.multiplier).toFixed(2)}x.`
    );
    setFairnessState((prev) => ({
      ...prev,
      nonce: data.nonce || 0,
      hashedServerSeed: data.hashedServerSeed || ''
    }));

    setRecentDrops((prev) => [
      {
        id: ballId,
        slot: Number(data.slot),
        payout: Number(data.payout || 0),
        profit: Number(data.profit || 0),
        multiplier: Number(data.multiplier || 0)
      },
      ...prev
    ].slice(0, 28));

    return data;
  };

  const onDrop = async () => {
    if (isBusy || isGameDisabled || !token) return;
    if (bet <= 0 || bet > userBalance) {
      setStatus('Invalid bet or insufficient balance.');
      return;
    }

    const count = Math.max(1, Math.min(20, Number(ballsToDrop) || 1));

    setIsBusy(true);
    let done = 0;
    try {
      for (let i = 0; i < count; i += 1) {
        // slight stagger gives cleaner visual multi-ball flow
        await runSingleDrop(i, count);
        done += 1;
        if (i < count - 1) await wait(140);
      }
      setStatus(count > 1 ? `Completed ${done} drops.` : 'Drop complete.');
    } catch (error) {
      setStatus(done > 0 ? `Stopped after ${done} drops: ${error.message}` : error.message || 'Drop failed.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Card className="game-play-card">
      <header className="page-header">
        <h2>Plinko Drop</h2>
        <p>{status}</p>
      </header>

      <section className={`plinko-stage ${riskClass}`}>
        <div className="plinko-board">
          <div className="plinko-start-dot" />

          {Array.from({ length: PEG_ROWS }).map((_, row) => (
            <div key={`row-${row}`} className="plinko-peg-row" style={{ '--row': row }}>
              {Array.from({ length: row + 3 }).map((__, peg) => (
                <span key={`peg-${row}-${peg}`} className="plinko-peg" />
              ))}
            </div>
          ))}

          {animatedBalls.map((ball) => (
            <span
              key={ball.id}
              className="plinko-ball"
              style={{ '--target': `${ball.targetPercent}%` }}
              aria-label={`Ball landing slot ${ball.slot}`}
            />
          ))}

          <div className="plinko-slots">
            {Array.from({ length: SLOT_COUNT }).map((_, slot) => {
              const normalized = slotHeat[slot];
              const isLatest = Number(result?.slot) === slot;
              return (
                <article
                  key={`slot-${slot}`}
                  className={`plinko-slot ${isLatest ? 'is-latest' : ''}`}
                  style={{ '--heat': normalized }}
                >
                  <span>{slot}</span>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="wallet-grid">
        <Card>
          <h3>Risk</h3>
          <p className="wallet-value">{risk.toUpperCase()}</p>
        </Card>
        <Card>
          <h3>Last Slot</h3>
          <p className="wallet-value">{result ? result.slot : '--'}</p>
        </Card>
        <Card>
          <h3>Last Payout</h3>
          <p className="wallet-value">{formatMoney(result?.payout || 0)}</p>
        </Card>
      </section>

      <section className="dice-rush-main">
        <aside className="dice-controls-card">
          <BetTerminal
            adapter={plinkoAdapter}
            betAmount={bet}
            balance={userBalance}
            state={{ risk }}
            minBet={0.01}
            maxBet={1_000_000}
            disabled={isBusy || isGameDisabled}
            onBetAmountChange={setBet}
            action={{
              label: isBusy ? 'Dropping...' : ballsToDrop > 1 ? `Drop ${ballsToDrop} Balls` : 'Drop Ball',
              onClick: () => void onDrop(),
              disabled: isBusy || isGameDisabled
            }}
            customFields={() => (
              <>
                <label className="bt-field">
                  Risk
                  <select value={risk} onChange={(event) => setRisk(event.target.value)} disabled={isBusy}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label className="bt-field">
                  Balls Per Drop
                  <input
                    type="number"
                    min="1"
                    max="20"
                    step="1"
                    value={ballsToDrop}
                    disabled={isBusy}
                    onChange={(event) => setBallsToDrop(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
                  />
                </label>
              </>
            )}
            stats={{
              sessionPL: sessionProfit,
              totalWagered,
              lastPayout: Number(result?.payout || 0),
              betsCount
            }}
          />

          <Card className="plinko-recent-card">
            <h3>Recent Drops</h3>
            <div className="plinko-recent-list">
              {recentDrops.length === 0 ? (
                <p className="plinko-empty">No drops yet.</p>
              ) : (
                recentDrops.map((drop) => (
                  <article key={drop.id} className={`plinko-recent-row ${drop.profit >= 0 ? 'is-win' : 'is-loss'}`}>
                    <span>S{drop.slot}</span>
                    <strong>{drop.multiplier.toFixed(2)}x</strong>
                    <em>{formatMoney(drop.payout)}</em>
                  </article>
                ))
              )}
            </div>
          </Card>
        </aside>

        <section className="dice-auto-panel">
          <FairnessPanel
            token={token}
            game="plinko"
            fairnessState={fairnessState}
            onClientSeedChange={(value) => setFairnessState((prev) => ({ ...prev, clientSeed: value }))}
            onRotateSeed={async () => {
              const data = await api.rotateFairnessSeed(token, 'plinko', fairnessState.clientSeed);
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

export default PlinkoDrop;
