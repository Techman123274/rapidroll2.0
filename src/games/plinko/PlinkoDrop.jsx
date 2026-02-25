import { useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import FairnessPanel from '../../components/fairness/FairnessPanel';
import BetTerminal from '../../components/bet-terminal/BetTerminal';
import plinkoAdapter from '../adapters/stubs/plinkoAdapter';
import { api } from '../../services/api';
import { useBatchQueue } from '../../hooks/useBatchQueue';
import { useSound } from '../../context/SoundContext';

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || min));

const validRows = [8, 10, 12, 14, 16];
const riskLevels = ['low', 'medium', 'high', 'extreme'];
const batchPresets = [1, 5, 10, 25, 50];

function PlinkoDrop({ isGameDisabled, userBalance, token, syncUser }) {
  const { play, unlockAudio } = useSound();
  const { isRunning, progress, start, stop } = useBatchQueue();

  const [bet, setBet] = useState(10);
  const [risk, setRisk] = useState('medium');
  const [rows, setRows] = useState(12);
  const [ballsToDrop, setBallsToDrop] = useState(1);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('Choose risk and drop.');
  const [sessionProfit, setSessionProfit] = useState(0);
  const [totalWagered, setTotalWagered] = useState(0);
  const [betsCount, setBetsCount] = useState(0);
  const [recentDrops, setRecentDrops] = useState([]);
  const [animatedBalls, setAnimatedBalls] = useState([]);
  const [ballSize, setBallSize] = useState(1);
  const [turbo, setTurbo] = useState(false);
  const [skipAnimations, setSkipAnimations] = useState(false);
  const [laneMode, setLaneMode] = useState('random');
  const [batchSummary, setBatchSummary] = useState({
    count: 0,
    wagered: 0,
    returned: 0,
    net: 0,
    bestMultiplier: 0,
    distribution: {}
  });
  const [fairnessState, setFairnessState] = useState({
    clientSeed: 'plinko-client-seed',
    nonce: 0,
    hashedServerSeed: ''
  });

  const slotCount = rows + 1;

  const slotHeat = useMemo(() => {
    const counts = Array.from({ length: slotCount }, () => 0);
    recentDrops.forEach((drop) => {
      if (drop.slot >= 0 && drop.slot < slotCount) counts[drop.slot] += 1;
    });
    const max = Math.max(1, ...counts);
    return counts.map((count) => count / max);
  }, [recentDrops, slotCount]);

  const progressPercent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const runSingleDrop = async (index, total, aggregate) => {
    const data = await api.dropPlinko(token, {
      betAmount: Number(bet),
      risk,
      rows,
      clientSeed: fairnessState.clientSeed
    });

    play({ key: 'plinko_drop', src: '/sounds/plinko_drop.wav', volume: 0.45, cooldownMs: 40 });

    const laneIndex = laneMode === 'random' ? Math.floor(Math.random() * slotCount) : clamp(laneMode, 0, slotCount - 1);
    const startPercent = (laneIndex / Math.max(1, slotCount - 1)) * 100;
    const targetPercent = (Number(data.slot) / Math.max(1, slotCount - 1)) * 100;

    const shouldAnimate = !skipAnimations && (!turbo || total <= 30 || index % 3 === 0 || index === total - 1);
    if (shouldAnimate) {
      const ballId = `${Date.now()}-${index}`;
      setAnimatedBalls((prev) => [
        ...prev,
        {
          id: ballId,
          targetPercent,
          startPercent,
          size: ballSize,
          duration: turbo ? 780 : 1450
        }
      ]);
      window.setTimeout(() => {
        setAnimatedBalls((prev) => prev.filter((ball) => ball.id !== ballId));
      }, turbo ? 900 : 1650);
    }

    setResult(data);
    syncUser?.(data.user);

    aggregate.count += 1;
    aggregate.wagered += Number(bet);
    aggregate.returned += Number(data.payout || 0);
    aggregate.bestMultiplier = Math.max(aggregate.bestMultiplier, Number(data.multiplier || 0));
    const distKey = Number(data.multiplier || 0).toFixed(2);
    aggregate.distribution[distKey] = (aggregate.distribution[distKey] || 0) + 1;

    setSessionProfit((prev) => Number((prev + Number(data.profit || 0)).toFixed(2)));
    setTotalWagered((prev) => Number((prev + Number(bet)).toFixed(2)));
    setBetsCount((prev) => prev + 1);

    setStatus(
      total > 1
        ? `Dropping ${index + 1}/${total} • slot ${data.slot} • ${Number(data.multiplier).toFixed(2)}x`
        : `Slot ${data.slot}, multiplier ${Number(data.multiplier).toFixed(2)}x.`
    );

    setFairnessState((prev) => ({
      ...prev,
      nonce: data.nonce || 0,
      hashedServerSeed: data.hashedServerSeed || ''
    }));

    setRecentDrops((prev) => [
      {
        id: `${Date.now()}-${index}`,
        slot: Number(data.slot),
        payout: Number(data.payout || 0),
        profit: Number(data.profit || 0),
        multiplier: Number(data.multiplier || 0)
      },
      ...prev
    ].slice(0, 40));

    if (Number(data.multiplier || 0) >= 8) {
      play({ key: 'plinko_big', src: '/sounds/plinko_big_win.wav', volume: 0.6, cooldownMs: 160 });
    } else {
      play({ key: 'plinko_bucket', src: '/sounds/plinko_bucket.wav', volume: 0.35, cooldownMs: 30 });
    }
  };

  const onDrop = async (presetCount = null) => {
    if (isGameDisabled || !token || isRunning) return;
    if (bet <= 0 || bet > userBalance) {
      setStatus('Invalid bet or insufficient balance.');
      return;
    }

    const count = clamp(presetCount ?? ballsToDrop, 1, 100);
    const expectedWager = Number((count * Number(bet)).toFixed(2));
    if (expectedWager > userBalance) {
      setStatus(`Insufficient balance for ${count} drops.`);
      return;
    }

    unlockAudio();
    const aggregate = { count: 0, wagered: 0, returned: 0, bestMultiplier: 0, distribution: {} };

    await start({
      total: count,
      intervalMs: skipAnimations ? 0 : turbo ? 55 : 130,
      task: async (index, totalBatches) => {
        await runSingleDrop(index, totalBatches, aggregate);
      },
      onComplete: (wasStopped) => {
        const net = Number((aggregate.returned - aggregate.wagered).toFixed(2));
        setBatchSummary({
          ...aggregate,
          wagered: Number(aggregate.wagered.toFixed(2)),
          returned: Number(aggregate.returned.toFixed(2)),
          net
        });
        setStatus(
          wasStopped
            ? `Batch stopped. ${aggregate.count} drops settled.`
            : `Batch complete: ${aggregate.count} drops • Net ${formatMoney(net)}.`
        );
      },
      onError: (error) => {
        setStatus(error.message || 'Drop failed.');
      }
    });
  };

  return (
    <Card className="game-play-card">
      <header className="page-header">
        <h2>Plinko Drop</h2>
        <p>{status}</p>
      </header>

      <section className={`plinko-stage plinko-risk-${risk}`}>
        <div className="plinko-board" style={{ '--plinko-rows': rows }}>
          <div className="plinko-start-dot" />

          {Array.from({ length: rows }).map((_, row) => (
            <div key={`row-${row}`} className="plinko-peg-row" style={{ '--row': row }}>
              {Array.from({ length: row + 2 }).map((__, peg) => (
                <span key={`peg-${row}-${peg}`} className="plinko-peg" />
              ))}
            </div>
          ))}

          {animatedBalls.map((ball) => (
            <span
              key={ball.id}
              className="plinko-ball"
              style={{
                '--target': `${ball.targetPercent}%`,
                '--start': `${ball.startPercent}%`,
                '--size': ball.size,
                '--duration': `${ball.duration}ms`
              }}
            />
          ))}

          <div className="plinko-slots" style={{ gridTemplateColumns: `repeat(${slotCount}, minmax(0, 1fr))` }}>
            {Array.from({ length: slotCount }).map((_, slot) => {
              const normalized = slotHeat[slot] || 0;
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

        <div className="plinko-batch-progress" aria-live="polite">
          <strong>Queue Progress</strong>
          <p>
            {progress.done}/{progress.total} settled ({progressPercent}%)
          </p>
          <div className="plinko-progress-track">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </section>

      <section className="wallet-grid">
        <Card>
          <h3>Rows</h3>
          <p className="wallet-value">{rows}</p>
        </Card>
        <Card>
          <h3>Risk</h3>
          <p className="wallet-value">{risk.toUpperCase()}</p>
        </Card>
        <Card>
          <h3>Last Slot</h3>
          <p className="wallet-value">{result ? result.slot : '--'}</p>
        </Card>
        <Card>
          <h3>Best Hit</h3>
          <p className="wallet-value">{batchSummary.bestMultiplier ? `${batchSummary.bestMultiplier.toFixed(2)}x` : '--'}</p>
        </Card>
      </section>

      <section className="dice-rush-main">
        <aside className="dice-controls-card">
          <BetTerminal
            adapter={plinkoAdapter}
            betAmount={bet}
            balance={userBalance}
            state={{ risk, rows }}
            minBet={0.01}
            maxBet={1_000_000}
            disabled={isRunning || isGameDisabled}
            onBetAmountChange={setBet}
            action={{
              label: isRunning ? `Dropping ${progress.done}/${progress.total}` : ballsToDrop > 1 ? `Drop ${ballsToDrop} Balls` : 'Drop Ball',
              onClick: () => void onDrop(),
              disabled: isRunning || isGameDisabled,
              className: isRunning ? 'btn-outline' : ''
            }}
            secondaryActions={
              isRunning
                ? [
                    {
                      label: 'Stop Queue',
                      onClick: stop,
                      disabled: false
                    }
                  ]
                : []
            }
            customFields={() => (
              <>
                <label className="bt-field">
                  Risk
                  <select value={risk} onChange={(event) => setRisk(event.target.value)} disabled={isRunning}>
                    {riskLevels.map((riskOption) => (
                      <option key={riskOption} value={riskOption}>
                        {riskOption}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="bt-field">
                  Rows
                  <select value={rows} onChange={(event) => setRows(Number(event.target.value))} disabled={isRunning}>
                    {validRows.map((row) => (
                      <option key={row} value={row}>
                        {row}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="bt-field">
                  Balls Per Drop
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={ballsToDrop}
                    disabled={isRunning}
                    onChange={(event) => setBallsToDrop(clamp(event.target.value, 1, 100))}
                  />
                </label>

                <div className="plinko-batch-presets">
                  {batchPresets.map((count) => (
                    <button
                      key={count}
                      type="button"
                      className="btn btn-outline"
                      disabled={isRunning}
                      onClick={() => {
                        setBallsToDrop(count);
                        void onDrop(count);
                      }}
                    >
                      x{count}
                    </button>
                  ))}
                </div>

                <label className="bt-field">
                  Lane
                  <select value={laneMode} onChange={(event) => setLaneMode(event.target.value)} disabled={isRunning}>
                    <option value="random">Random</option>
                    {Array.from({ length: slotCount }).map((_, idx) => (
                      <option key={`lane-${idx}`} value={String(idx)}>
                        Start {idx}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="bt-field">
                  Ball Size ({ballSize.toFixed(2)}x)
                  <input
                    type="range"
                    min="0.7"
                    max="1.4"
                    step="0.05"
                    value={ballSize}
                    disabled={isRunning}
                    onChange={(event) => setBallSize(Number(event.target.value))}
                  />
                </label>

                <div className="plinko-options-row">
                  <label>
                    <input type="checkbox" checked={turbo} disabled={isRunning} onChange={(event) => setTurbo(event.target.checked)} />
                    Turbo
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={skipAnimations}
                      disabled={isRunning}
                      onChange={(event) => setSkipAnimations(event.target.checked)}
                    />
                    Skip Animations
                  </label>
                </div>
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
            <h3>Batch Summary</h3>
            <div className="plinko-summary-grid">
              <p>
                <span>Total Wagered</span>
                <strong>{formatMoney(batchSummary.wagered)}</strong>
              </p>
              <p>
                <span>Total Return</span>
                <strong>{formatMoney(batchSummary.returned)}</strong>
              </p>
              <p>
                <span>Net</span>
                <strong className={batchSummary.net >= 0 ? 'is-positive' : 'is-negative'}>{formatMoney(batchSummary.net)}</strong>
              </p>
              <p>
                <span>Best Hit</span>
                <strong>{batchSummary.bestMultiplier ? `${batchSummary.bestMultiplier.toFixed(2)}x` : '--'}</strong>
              </p>
            </div>

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
