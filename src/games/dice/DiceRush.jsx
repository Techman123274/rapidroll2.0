import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../../components/ui/Card';
import { api } from '../../services/api';
import BetTerminal from '../../components/bet-terminal/BetTerminal';
import FairnessPanel from '../../components/fairness/FairnessPanel';
import diceAdapter from '../adapters/diceAdapter';

const VOLUME_KEY = 'dice_rush_volume';
const MUTE_KEY = 'dice_rush_muted';
const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

function useDiceAudio(volume, muted) {
  const ctxRef = useRef(null);

  const getCtx = () => {
    if (ctxRef.current) return ctxRef.current;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctxRef.current = new AudioCtx();
    return ctxRef.current;
  };

  const tone = (frequency, duration, type = 'sine', gain = 0.1) => {
    if (muted || volume <= 0) return;
    const ctx = getCtx();
    if (!ctx) return;
    const start = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, Math.min(1, gain * volume)), start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  };

  return {
    tap() {
      tone(320, 0.05, 'triangle', 0.08);
    },
    rollStart() {
      tone(260, 0.08, 'square', 0.07);
    },
    win() {
      tone(480, 0.08, 'sine', 0.12);
      tone(700, 0.14, 'sine', 0.1);
    },
    lose() {
      tone(130, 0.16, 'sawtooth', 0.1);
    }
  };
}

function DiceRush({ isGameDisabled, userBalance, token, refreshUser, syncUser }) {
  const [bet, setBet] = useState(10);
  const [target, setTarget] = useState(50);
  const [mode, setMode] = useState('under');
  const [rollValue, setRollValue] = useState(50);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [statusText, setStatusText] = useState('Set your bet and roll.');
  const [isRolling, setIsRolling] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [autoBetEnabled, setAutoBetEnabled] = useState(false);
  const [autoRounds, setAutoRounds] = useState(10);
  const [onWinIncrease, setOnWinIncrease] = useState(0);
  const [onLossIncrease, setOnLossIncrease] = useState(25);
  const [resetOnWin, setResetOnWin] = useState(true);
  const [resetOnLoss, setResetOnLoss] = useState(false);
  const [stopLoss, setStopLoss] = useState(150);
  const [stopProfit, setStopProfit] = useState(250);
  const [sessionProfit, setSessionProfit] = useState(0);
  const [fairnessState, setFairnessState] = useState({ clientSeed: 'dice-client-seed', nonce: 0, hashedServerSeed: '' });
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === 'true');
  const [volume, setVolume] = useState(() => {
    const value = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.65;
  });

  const autoActiveRef = useRef(false);
  const autoStakeRef = useRef(10);
  const lastResponseRef = useRef(null);
  const audio = useDiceAudio(volume, muted);

  useEffect(() => {
    localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);
  useEffect(() => {
    localStorage.setItem(MUTE_KEY, String(muted));
  }, [muted]);

  const winChance = useMemo(() => (mode === 'under' ? target : 100 - target), [mode, target]);
  const multiplier = useMemo(() => Number((99 / winChance).toFixed(6)), [winChance]);
  const payoutOnWin = useMemo(() => Number((bet * multiplier).toFixed(2)), [bet, multiplier]);
  const profitOnWin = useMemo(() => Number((payoutOnWin - bet).toFixed(2)), [payoutOnWin, bet]);

  const runRollAnimation = (finalValue) =>
    new Promise((resolve) => {
      const start = performance.now();
      const duration = 460;
      const animate = (now) => {
        const t = Math.min(1, (now - start) / duration);
        if (t < 1) {
          const fake = Number((Math.random() * 100).toFixed(2));
          setRollValue(fake);
          window.requestAnimationFrame(animate);
          return;
        }
        setRollValue(Number(finalValue.toFixed(2)));
        resolve();
      };
      window.requestAnimationFrame(animate);
    });

  const loadHistory = async () => {
    if (!token) return;
    try {
      const data = await api.getDiceHistory(token);
      setHistory(data.history || []);
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const performRoll = async (stakeValue) => {
    if (!token) return null;
    const payload = {
      betAmount: Number(stakeValue),
      target: Number(target.toFixed(2)),
      mode
    };

    audio.rollStart();
    const response = await api.rollDice(token, payload);
    await runRollAnimation(response.roll);
    if (response.user) {
      syncUser?.(response.user);
    } else {
      await refreshUser();
    }
    lastResponseRef.current = response;
    setResult(response);
    setStatusText(
      response.status === 'won'
        ? `Win ${formatMoney(response.profit)} at ${response.roll.toFixed(2)}`
        : `Loss ${formatMoney(Math.abs(response.profit))} at ${response.roll.toFixed(2)}`
    );

    if (response.status === 'won') audio.win();
    else audio.lose();

    setHistory((prev) => [response, ...prev].slice(0, 100));
    setSessionProfit((prev) => Number((prev + response.profit).toFixed(2)));
    setFairnessState({
      clientSeed: response.clientSeed || fairnessState.clientSeed,
      nonce: response.nonce || 0,
      hashedServerSeed: response.hashedServerSeed || ''
    });
    return response;
  };

  const rollOnce = async () => {
    if (isBusy || isRolling || isGameDisabled) return;
    if (bet <= 0 || bet > userBalance) {
      setStatusText('Invalid bet or insufficient balance.');
      return;
    }
    setIsBusy(true);
    setIsRolling(true);
    try {
      await performRoll(bet);
    } catch (error) {
      setStatusText(error.message || 'Roll failed.');
    } finally {
      setIsRolling(false);
      setIsBusy(false);
    }
  };

  const stopAutoBet = () => {
    autoActiveRef.current = false;
    setAutoBetEnabled(false);
  };

  const startAutoBet = async () => {
    if (autoActiveRef.current || isBusy || isRolling || isGameDisabled) return;
    autoActiveRef.current = true;
    setAutoBetEnabled(true);
    autoStakeRef.current = Number(bet);

    let roundsDone = 0;
    let localProfit = 0;

    while (autoActiveRef.current) {
      if (autoRounds > 0 && roundsDone >= autoRounds) break;
      if (stopLoss > 0 && -localProfit >= stopLoss) break;
      if (stopProfit > 0 && localProfit >= stopProfit) break;

      const stake = Number(Math.max(0.01, autoStakeRef.current).toFixed(2));
      if (stake > Number(userBalance) * 5) break;

      setIsBusy(true);
      setIsRolling(true);
      let response;
      try {
        response = await performRoll(stake);
      } catch {
        break;
      } finally {
        setIsRolling(false);
        setIsBusy(false);
      }
      if (!response) break;

      roundsDone += 1;
      localProfit = Number((localProfit + response.profit).toFixed(2));

      if (response.status === 'won') {
        if (resetOnWin) {
          autoStakeRef.current = Number(bet);
        } else {
          autoStakeRef.current = Number((stake * (1 + onWinIncrease / 100)).toFixed(2));
        }
      } else if (resetOnLoss) {
        autoStakeRef.current = Number(bet);
      } else {
        autoStakeRef.current = Number((stake * (1 + onLossIncrease / 100)).toFixed(2));
      }

      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }

    autoActiveRef.current = false;
    setAutoBetEnabled(false);
  };

  const outcomeDot = (row) => (row.status === 'won' ? 'dot-win' : 'dot-loss');
  const markerPosition = Number(((rollValue / 100) * 100).toFixed(2));
  const targetPosition = Number(((target / 100) * 100).toFixed(2));

  return (
    <Card className={`dice-rush-root ${result ? `result-${result.status}` : ''}`}>
      <section className="dice-rush-main">
        <div className="dice-visual-card">
          <header className="dice-visual-head">
            <h2>Dice Rush</h2>
            <p>{statusText}</p>
          </header>

          <div className="dice-slider-wrap">
            <div className="dice-zones">
              <div
                className={`dice-zone win-zone ${mode === 'under' ? 'left' : 'right'}`}
                style={{
                  width: mode === 'under' ? `${targetPosition}%` : `${100 - targetPosition}%`,
                  left: mode === 'under' ? 0 : `${targetPosition}%`
                }}
              />
              <div className="dice-zone lose-zone" />
              <div className="dice-target-marker" style={{ left: `${targetPosition}%` }} />
              <div className="dice-roll-marker" style={{ left: `${markerPosition}%` }} />
            </div>

            <input
              type="range"
              min="2"
              max="98"
              step="0.01"
              value={target}
              disabled={isBusy || isRolling}
              onChange={(event) => setTarget(Number(event.target.value))}
            />
          </div>

          <div className="dice-live-stats">
            <p>
              <span>Roll</span>
              <strong>{rollValue.toFixed(2)}</strong>
            </p>
            <p>
              <span>Target</span>
              <strong>{target.toFixed(2)}</strong>
            </p>
            <p>
              <span>Win Chance</span>
              <strong>{winChance.toFixed(2)}%</strong>
            </p>
            <p>
              <span>Multiplier</span>
              <strong>{multiplier.toFixed(6)}x</strong>
            </p>
            <p>
              <span>Profit on Win</span>
              <strong>{formatMoney(profitOnWin)}</strong>
            </p>
          </div>
        </div>

        <aside className="dice-controls-card">
          <BetTerminal
            adapter={diceAdapter}
            betAmount={bet}
            balance={userBalance}
            state={{ target, mode }}
            minBet={0.01}
            maxBet={1_000_000}
            disabled={isBusy || isRolling || isGameDisabled}
            onBetAmountChange={setBet}
            action={{
              label: isRolling ? 'Rolling...' : 'Roll',
              onClick: () => void rollOnce(),
              disabled: isBusy || isRolling || isGameDisabled
            }}
            secondaryActions={[
              {
                label: mode === 'under' ? 'Switch: Over' : 'Switch: Under',
                onClick: () => setMode((prev) => (prev === 'under' ? 'over' : 'under')),
                disabled: isBusy
              }
            ]}
            customFields={() => (
              <>
                <label className="bt-field">
                  Target
                  <input
                    type="number"
                    min="2"
                    max="98"
                    step="0.01"
                    value={target}
                    onChange={(event) => setTarget(Math.max(2, Math.min(98, Number(event.target.value) || 2)))}
                  />
                </label>
                <label className="bt-field">
                  Mode
                  <select value={mode} onChange={(event) => setMode(event.target.value)}>
                    <option value="under">Under</option>
                    <option value="over">Over</option>
                  </select>
                </label>
              </>
            )}
            stats={{
              sessionPL: sessionProfit,
              totalWagered: history.reduce((sum, row) => sum + Number(row.betAmount || 0), 0),
              lastPayout: Number(lastResponseRef.current?.payout || 0),
              betsCount: history.length
            }}
            autoBet={{
              enabled: autoBetEnabled,
              config: {
                rounds: autoRounds,
                increaseOnLoss: onLossIncrease,
                resetOnWin,
                stopLoss,
                stopProfit
              },
              onToggle: (next) => {
                if (!next) stopAutoBet();
                else void startAutoBet();
              },
              onChange: (key, value) => {
                if (key === 'rounds') setAutoRounds(value);
                if (key === 'increaseOnLoss') setOnLossIncrease(value);
                if (key === 'resetOnWin') setResetOnWin(Boolean(value));
                if (key === 'stopLoss') setStopLoss(value);
                if (key === 'stopProfit') setStopProfit(value);
              }
            }}
          />
        </aside>
      </section>

      <section className="dice-rush-bottom">
        <div className="dice-auto-panel">
          <FairnessPanel
            token={token}
            game="dice"
            fairnessState={fairnessState}
            onClientSeedChange={(value) => setFairnessState((prev) => ({ ...prev, clientSeed: value }))}
            onRotateSeed={async () => {
              await api.rotateFairnessSeed(token, 'dice', fairnessState.clientSeed);
              setStatusText('Dice server seed rotated.');
            }}
          />
          <div className="dice-volume-controls">
            <label>
              Volume
              <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
            </label>
            <label className="dice-checkbox">
              <input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} />
              Mute
            </label>
            <label>
              On Win +%
              <input type="number" min="0" step="1" value={onWinIncrease} onChange={(event) => setOnWinIncrease(Math.max(0, Number(event.target.value) || 0))} />
            </label>
            <label className="dice-checkbox">
              <input type="checkbox" checked={resetOnLoss} onChange={(event) => setResetOnLoss(event.target.checked)} />
              Reset On Loss
            </label>
          </div>
        </div>

        <div className="dice-history-panel">
          <div className="dice-outcome-strip">
            {history.slice(0, 20).map((row, index) => (
              <span key={`${row.id || row.nonce}-${index}`} className={`dice-dot ${outcomeDot(row)}`} />
            ))}
          </div>

          <div className="dice-history-table">
            <div className="dice-history-head">
              <span>Time</span>
              <span>Bet</span>
              <span>Roll</span>
              <span>Target</span>
              <span>Mode</span>
              <span>Multi</span>
              <span>Profit</span>
              <span>Result</span>
            </div>
            <div className="dice-history-body">
              {history.map((row, index) => (
                <div key={`${row.id || row.nonce}-${index}`} className={`dice-history-row ${row.status}`}>
                  <span>{new Date(row.createdAt || Date.now()).toLocaleTimeString()}</span>
                  <span>{formatMoney(row.betAmount)}</span>
                  <span>{Number(row.roll).toFixed(2)}</span>
                  <span>{Number(row.target).toFixed(2)}</span>
                  <span>{row.mode}</span>
                  <span>{Number(row.multiplier).toFixed(6)}x</span>
                  <span>{formatMoney(row.profit)}</span>
                  <span>{row.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </Card>
  );
}

export default DiceRush;
