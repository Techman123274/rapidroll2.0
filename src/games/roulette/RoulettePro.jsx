import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { api } from '../../services/api';
import FairnessPanel from '../../components/fairness/FairnessPanel';
import {
  ROULETTE_WHEEL_ORDER,
  SLOT_ANGLE,
  angleToSlotIndex,
  numberToSlotIndex,
  slotIndexToCenterAngle,
  getWinningNumberAtPointer,
  buildDeterministicSpinTarget,
  normalizeAngle
} from '../../lib/roulette/wheelGeometry';

const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const CHIP_VALUES = [1, 5, 10, 25, 100];
const VOLUME_KEY = 'roulette_pro_volume';
const MUTE_KEY = 'roulette_pro_muted';

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;
const getColor = (n) => (n === 0 ? 'green' : RED_SET.has(n) ? 'red' : 'black');

function useRouletteAudio(volume, muted) {
  const ctxRef = useRef(null);

  const playTone = (freq, dur, type = 'sine', gain = 0.1) => {
    if (muted || volume <= 0) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!ctxRef.current) ctxRef.current = new AudioCtx();
    const ctx = ctxRef.current;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const start = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, Math.min(1, gain * volume)), start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  };

  return {
    chip() {
      playTone(280, 0.05, 'triangle', 0.07);
    },
    spinStart() {
      playTone(120, 0.16, 'sawtooth', 0.09);
    },
    win() {
      playTone(460, 0.08, 'sine', 0.11);
      playTone(700, 0.12, 'sine', 0.1);
    },
    loss() {
      playTone(140, 0.14, 'sawtooth', 0.09);
    }
  };
}

function RoulettePro({ isGameDisabled, userBalance, token, refreshUser, syncUser }) {
  const [selectedChip, setSelectedChip] = useState(5);
  const [bets, setBets] = useState([]);
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [statusText, setStatusText] = useState('Place chips and spin.');
  const [lastBets, setLastBets] = useState([]);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [ballRotation, setBallRotation] = useState(0);
  const [spinDurationMs, setSpinDurationMs] = useState(4100);
  const [wheelSize, setWheelSize] = useState(0);
  const [debugMode, setDebugMode] = useState(false);
  const [sessionProfit, setSessionProfit] = useState(0);
  const [lastPayout, setLastPayout] = useState(0);
  const [fairnessState, setFairnessState] = useState({ clientSeed: 'roulette-client-seed', nonce: 0, hashedServerSeed: '' });
  const [volume, setVolume] = useState(() => {
    const saved = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(saved) ? Math.max(0, Math.min(1, saved)) : 0.65;
  });
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === 'true');
  const wheelRotationRef = useRef(0);
  const ballRotationRef = useRef(0);
  const wheelWrapRef = useRef(null);
  const audio = useRouletteAudio(volume, muted);

  const getRandomInt = (min, max) => {
    const lower = Math.ceil(Math.min(min, max));
    const upper = Math.floor(Math.max(min, max));
    const range = upper - lower + 1;
    if (range <= 1) return lower;
    if (window.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return lower + (buf[0] % range);
    }
    return lower + Math.floor(Math.random() * range);
  };

  const buildSpinProfile = () => {
    const wheelDirection = getRandomInt(0, 1) === 0 ? -1 : 1;
    const ballDirection = getRandomInt(0, 1) === 0 ? -1 : 1;
    const maxOffset = SLOT_ANGLE * 0.45;
    const rawOffset = getRandomInt(-1000, 1000) / 1000;
    return {
      wheelDirection,
      ballDirection,
      wheelSpins: getRandomInt(5, 9),
      ballReverseSpins: getRandomInt(5, 12),
      finalPocketOffsetDegrees: rawOffset * maxOffset,
      spinDurationMs: getRandomInt(1800, 2800)
    };
  };

  useEffect(() => {
    localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);
  useEffect(() => {
    localStorage.setItem(MUTE_KEY, String(muted));
  }, [muted]);

  useEffect(() => {
    wheelRotationRef.current = wheelRotation;
  }, [wheelRotation]);

  useEffect(() => {
    ballRotationRef.current = ballRotation;
  }, [ballRotation]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(window.location.search);
    setDebugMode(params.get('debugRoulette') === '1');
  }, []);

  useEffect(() => {
    const node = wheelWrapRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect?.width || 0;
      setWheelSize(next);
    });
    observer.observe(node);
    setWheelSize(node.clientWidth || 0);
    return () => observer.disconnect();
  }, []);

  const totalBet = useMemo(() => Number(bets.reduce((sum, row) => sum + row.amount, 0).toFixed(2)), [bets]);
  const slotRadius = useMemo(() => Math.max(0, wheelSize / 2 - 18), [wheelSize]);
  const ballRadius = useMemo(() => Math.max(0, wheelSize / 2 - 10), [wheelSize]);

  const addBet = (type, value = null) => {
    audio.chip();
    setBets((prev) => {
      const idx = prev.findIndex((row) => row.type === type && row.value === value);
      if (idx === -1) return [...prev, { type, value, amount: selectedChip }];
      const next = [...prev];
      next[idx] = { ...next[idx], amount: Number((next[idx].amount + selectedChip).toFixed(2)) };
      return next;
    });
  };

  const clearBets = () => setBets([]);
  const repeatLastBet = () => {
    if (lastBets.length > 0) setBets(lastBets.map((row) => ({ ...row })));
  };

  const loadHistory = async () => {
    try {
      const data = await api.getRouletteHistory();
      setHistory(data.history || []);
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  const spin = async () => {
    if (isBusy || isGameDisabled || !token) return;
    if (bets.length === 0) {
      setStatusText('No bets placed.');
      return;
    }
    if (totalBet > userBalance) {
      setStatusText('Insufficient balance.');
      return;
    }

    setIsBusy(true);
    setResult(null);
    setStatusText('Spinning...');
    audio.spinStart();

    try {
      const payload = { bets };
      const response = await api.spinRoulette(token, payload);
      const spinProfile = buildSpinProfile();
      setSpinDurationMs(spinProfile.spinDurationMs);
      const spinTarget = buildDeterministicSpinTarget({
        currentWheelRotation: wheelRotationRef.current,
        currentBallRotation: ballRotationRef.current,
        winningNumber: response.winningNumber,
        ...spinProfile
      });

      setWheelRotation(spinTarget.targetWheelRotation);
      setBallRotation(spinTarget.targetBallRotation);

      await new Promise((resolve) => window.setTimeout(resolve, spinProfile.spinDurationMs + 80));

      const resolvedVisual = getWinningNumberAtPointer(spinTarget.targetWheelRotation, spinTarget.targetBallRotation);
      const match = resolvedVisual === response.winningNumber;
      if (import.meta.env.DEV) {
        const relativeAngle = normalizeAngle(spinTarget.targetBallRotation - spinTarget.targetWheelRotation);
        console.log('[roulette-spin-debug]', {
          backendWinningNumber: response.winningNumber,
          finalWheelRotation: spinTarget.targetWheelRotation,
          finalBallRotation: spinTarget.targetBallRotation,
          wheelDirection: spinTarget.wheelDirection,
          ballDirection: spinTarget.ballDirection,
          mappedSlotIndex: angleToSlotIndex(relativeAngle),
          resolvedVisual,
          match
        });
      }

      if (!match) {
        const correctedWheel = spinTarget.targetWheelRotation;
        const correctedBall = correctedWheel + slotIndexToCenterAngle(numberToSlotIndex(response.winningNumber));
        setWheelRotation(correctedWheel);
        setBallRotation(correctedBall);
        if (import.meta.env.DEV) {
          console.warn('[roulette-spin-corrected]', {
            backendWinningNumber: response.winningNumber,
            correctedWheel,
            correctedBall,
            resolvedAfterCorrection: getWinningNumberAtPointer(correctedWheel, correctedBall)
          });
        }
      }

      if (response.user) {
        syncUser?.(response.user);
      } else {
        await refreshUser();
      }
      setResult(response);
      setLastPayout(Number(response.totalPayout || 0));
      setSessionProfit((prev) => Number((prev + Number(response.totalProfit || 0)).toFixed(2)));
      setStatusText(
        `${response.winningNumber} ${response.color.toUpperCase()} · ${response.status === 'lost' ? 'No hit' : `Payout ${formatMoney(response.totalPayout)}`}`
      );
      setFairnessState((prev) => ({
        clientSeed: prev.clientSeed,
        nonce: response.nonce || 0,
        hashedServerSeed: response.hashedServerSeed || ''
      }));

      if (response.status === 'lost') audio.loss();
      else audio.win();

      setLastBets(bets);
      setBets([]);
      setHistory((prev) => [{ winningNumber: response.winningNumber, color: response.color, spinId: response.spinId }, ...prev].slice(0, 120));
    } catch (error) {
      setStatusText(error.message || 'Spin failed.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Card className="roulette-pro-root">
      <section className="roulette-top">
        <div className="roulette-wheel-card">
            <div className="roulette-wheel-wrap" ref={wheelWrapRef}>
            <div
              className="roulette-wheel"
              style={{ transform: `rotate(${wheelRotation}deg)`, '--roulette-spin-duration': `${spinDurationMs}ms` }}
            >
              {ROULETTE_WHEEL_ORDER.map((n, i) => (
                (() => {
                  const angleDeg = SLOT_ANGLE * i - 90;
                  const angle = (angleDeg * Math.PI) / 180;
                  const x = wheelSize / 2 + slotRadius * Math.cos(angle);
                  const y = wheelSize / 2 + slotRadius * Math.sin(angle);
                  return (
                    <span
                      key={n}
                      className={`wheel-slot ${getColor(n)}`}
                      style={{ left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -50%)' }}
                    >
                      {n}
                    </span>
                  );
                })()
              ))}
            </div>
            <div
              className="roulette-ball-track"
              style={{ transform: `rotate(${ballRotation}deg)`, '--roulette-spin-duration': `${spinDurationMs}ms` }}
            >
              <span className="roulette-ball" style={{ '--ball-radius': `${ballRadius}px` }} />
            </div>
            <span className="roulette-pointer" />
            {debugMode && (
              <>
                <span className="roulette-debug-cross horizontal" />
                <span className="roulette-debug-cross vertical" />
                <span className="roulette-debug-ring" />
              </>
            )}
          </div>
          {debugMode && (
            <div className="roulette-debug-readout">
              <p>
                <span>Wheel</span>
                <strong>{normalizeAngle(wheelRotation).toFixed(3)}deg</strong>
              </p>
              <p>
                <span>Ball</span>
                <strong>{normalizeAngle(ballRotation).toFixed(3)}deg</strong>
              </p>
              <p>
                <span>Visual</span>
                <strong>{getWinningNumberAtPointer(wheelRotation, ballRotation)}</strong>
              </p>
              <p>
                <span>Slot Index</span>
                <strong>{angleToSlotIndex(normalizeAngle(ballRotation - wheelRotation))}</strong>
              </p>
            </div>
          )}
          <div className={`roulette-result-banner ${result ? result.color : ''}`}>
            {result ? `Winning: ${result.winningNumber} ${result.color.toUpperCase()}` : 'Awaiting spin'}
          </div>
          <p className="roulette-status">{statusText}</p>
        </div>

        <aside className="roulette-slip-card">
          <h3>Bet Slip</h3>
          <div className="chip-selector">
            {CHIP_VALUES.map((chip) => (
              <button key={chip} type="button" className={selectedChip === chip ? 'active' : ''} onClick={() => setSelectedChip(chip)}>
                {chip}
              </button>
            ))}
          </div>

          <div className="slip-list">
            {bets.map((bet, idx) => (
              <div key={`${bet.type}-${bet.value}-${idx}`} className="slip-row">
                <span>
                  {bet.type}
                  {bet.value !== null ? `:${bet.value}` : ''}
                </span>
                <strong>{formatMoney(bet.amount)}</strong>
              </div>
            ))}
          </div>

          <div className="roulette-stats">
            <p>
              <span>Total Bet</span>
              <strong>{formatMoney(totalBet)}</strong>
            </p>
            <p>
              <span>Balance</span>
              <strong>{formatMoney(userBalance)}</strong>
            </p>
            <p>
              <span>Last Payout</span>
              <strong>{formatMoney(lastPayout)}</strong>
            </p>
            <p>
              <span>Session P/L</span>
              <strong>{formatMoney(sessionProfit)}</strong>
            </p>
          </div>

          <div className="roulette-actions">
            <Button className="spin-btn" onClick={() => void spin()} disabled={isBusy || isGameDisabled}>
              {isBusy ? 'Spinning...' : 'Spin'}
            </Button>
            <Button variant="outline" onClick={clearBets} disabled={isBusy || bets.length === 0}>
              Clear
            </Button>
            <Button variant="outline" onClick={repeatLastBet} disabled={isBusy || lastBets.length === 0}>
              Repeat
            </Button>
          </div>

          <div className="roulette-audio">
            <label>
              Volume
              <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
            </label>
            <label className="mute-check">
              <input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} />
              Mute
            </label>
          </div>
        </aside>
      </section>

      <section className="roulette-bottom">
        <div className="roulette-history-strip">
          {history.slice(0, 100).map((entry, idx) => (
            <span key={`${entry.spinId || idx}-${idx}`} className={`history-pill ${entry.color}`}>
              {entry.winningNumber}
            </span>
          ))}
        </div>

        <div className="roulette-table">
          <div className="roulette-zero" onClick={() => addBet('straight', 0)}>
            0
          </div>
          <div className="roulette-grid">
            {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" className={`roulette-cell ${getColor(n)}`} onClick={() => addBet('straight', n)}>
                {n}
              </button>
            ))}
          </div>
          <div className="roulette-outside">
            <button type="button" onClick={() => addBet('red')}>
              Red
            </button>
            <button type="button" onClick={() => addBet('black')}>
              Black
            </button>
            <button type="button" onClick={() => addBet('even')}>
              Even
            </button>
            <button type="button" onClick={() => addBet('odd')}>
              Odd
            </button>
            <button type="button" onClick={() => addBet('low')}>
              1-18
            </button>
            <button type="button" onClick={() => addBet('high')}>
              19-36
            </button>
            <button type="button" onClick={() => addBet('dozen', 1)}>
              1st 12
            </button>
            <button type="button" onClick={() => addBet('dozen', 2)}>
              2nd 12
            </button>
            <button type="button" onClick={() => addBet('dozen', 3)}>
              3rd 12
            </button>
            <button type="button" onClick={() => addBet('column', 1)}>
              Col 1
            </button>
            <button type="button" onClick={() => addBet('column', 2)}>
              Col 2
            </button>
            <button type="button" onClick={() => addBet('column', 3)}>
              Col 3
            </button>
          </div>
        </div>
        <FairnessPanel
          token={token}
          game="roulette"
          fairnessState={fairnessState}
          onClientSeedChange={(value) => setFairnessState((prev) => ({ ...prev, clientSeed: value }))}
          onRotateSeed={async () => {
            await api.rotateFairnessSeed(token, 'roulette', fairnessState.clientSeed);
            setStatusText('Roulette server seed rotated.');
          }}
        />
      </section>
    </Card>
  );
}

export default RoulettePro;
