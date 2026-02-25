import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../components/ui/Button';
import FairnessPanel from '../../components/fairness/FairnessPanel';
import { useSound } from '../../context/SoundContext';

const SOUND_SETTINGS = {
  tile_tap: { src: '/sounds/tile_tap.wav', volume: 0.25, cooldownMs: 35 },
  diamond_tick: { src: '/sounds/diamond_tick.wav', volume: 0.35, cooldownMs: 35 },
  mine_thud: { src: '/sounds/mine_thud.wav', volume: 0.4, cooldownMs: 80 },
  cashout_rise: { src: '/sounds/cashout_rise.wav', volume: 0.5, cooldownMs: 120 }
};

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

const easeOut = (t) => 1 - (1 - t) ** 3;

const combination = (n, k) => {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= kk; i += 1) {
    result = (result * (n - kk + i)) / i;
  }
  return result;
};

const getMultiplier = (tileCount, mineCount, safeRevealed, houseEdge = 0.01) => {
  if (safeRevealed <= 0) return 1;
  const safeCount = tileCount - mineCount;
  const survival = combination(safeCount, safeRevealed) / combination(tileCount, safeRevealed);
  return Number(((1 / survival) * (1 - houseEdge)).toFixed(4));
};

const getRiskLabel = (mineCount, gridSize) => {
  const ratio = mineCount / (gridSize * gridSize);
  if (ratio <= 0.12) return 'Low';
  if (ratio <= 0.25) return 'Medium';
  if (ratio <= 0.4) return 'High';
  return 'Extreme';
};

const pickUniqueIndexes = (total, count) => {
  const pool = Array.from({ length: total }, (_, idx) => idx);
  const picks = [];
  while (picks.length < count && pool.length > 0) {
    const pick = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(pick, 1)[0]);
  }
  return new Set(picks);
};

function useStakeMinesAudio(volume, muted) {
  const soundsRef = useRef({});
  const lastPlayRef = useRef(new Map());
  const failedSoundsRef = useRef(new Set());
  const timersRef = useRef([]);
  const audioContextRef = useRef(null);

  const ensureContext = () => {
    if (audioContextRef.current) return audioContextRef.current;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContextRef.current = new AudioCtx();
    return audioContextRef.current;
  };

  const synth = (name) => {
    if (muted || volume <= 0) return;
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const baseGain = Math.max(0.0001, Math.min(1, volume));
    const tone = (frequency, duration, type = 'sine', gainFactor = 0.2, delay = 0) => {
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(baseGain * gainFactor, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    };

    if (name === 'tile_tap') {
      tone(220, 0.05, 'triangle', 0.14);
      tone(180, 0.06, 'sine', 0.08, 0.02);
      return;
    }
    if (name === 'diamond_tick') {
      tone(460, 0.06, 'triangle', 0.18);
      tone(640, 0.08, 'sine', 0.12, 0.04);
      return;
    }
    if (name === 'mine_thud') {
      tone(170, 0.11, 'sawtooth', 0.2);
      tone(100, 0.14, 'sawtooth', 0.14, 0.06);
      return;
    }
    if (name === 'cashout_rise') {
      tone(360, 0.08, 'sine', 0.2);
      tone(520, 0.1, 'sine', 0.16, 0.08);
      tone(760, 0.12, 'sine', 0.14, 0.16);
    }
  };

  useEffect(() => {
    const instances = {};
    Object.entries(SOUND_SETTINGS).forEach(([key, value]) => {
      const audio = new Audio(value.src);
      audio.preload = 'auto';
      audio.addEventListener('error', () => {
        failedSoundsRef.current.add(key);
      });
      instances[key] = audio;
    });
    soundsRef.current = instances;

    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
      Object.values(instances).forEach((audio) => {
        audio.pause();
        audio.src = '';
      });
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        void audioContextRef.current.close();
      }
      failedSoundsRef.current.clear();
      audioContextRef.current = null;
      soundsRef.current = {};
    };
  }, []);

  const play = (name, delayMs = 0) => {
    if (muted || volume <= 0) return;
    const config = SOUND_SETTINGS[name];
    const audio = soundsRef.current[name];
    if (!config || !audio) return;

    const now = performance.now();
    const last = lastPlayRef.current.get(name) || 0;
    if (now - last < config.cooldownMs) return;
    lastPlayRef.current.set(name, now);

    const timer = window.setTimeout(() => {
      try {
        if (failedSoundsRef.current.has(name) || audio.readyState < 2) {
          synth(name);
          return;
        }

        audio.pause();
        audio.currentTime = 0;
        audio.volume = Math.max(0, Math.min(1, config.volume * volume));
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => synth(name));
        }
      } catch {
        synth(name);
      }
    }, delayMs);

    timersRef.current.push(timer);
  };

  return { play };
}

function useAnimatedNumber(target, durationMs = 300) {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef(0);
  const previousRef = useRef(target);

  useEffect(() => {
    const from = previousRef.current;
    const to = target;
    previousRef.current = target;

    const start = performance.now();

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      const value = from + (to - from) * easeOut(progress);
      setDisplay(value);
      if (progress < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };

    window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  return display;
}

function StakeMinesTile({
  index,
  revealed,
  backVisible,
  pressed,
  flipping,
  mine,
  shake,
  flash,
  disabled,
  onReveal
}) {
  return (
    <button
      type="button"
      className={`stake-mines-tile ${revealed ? 'is-revealed' : ''} ${backVisible ? 'show-back' : ''} ${
        pressed ? 'is-pressed' : ''
      } ${flipping ? 'is-flipping' : ''} ${mine ? 'is-mine' : ''} ${shake ? 'is-shake' : ''} ${flash ? 'is-flash' : ''}`}
      onClick={() => onReveal(index)}
      disabled={disabled}
    >
      <span className="stake-mines-face face-front" />
      <span className="stake-mines-face face-back">
        {mine ? (
          <span className="stake-mines-symbol mine-symbol" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <circle cx="12" cy="12" r="6.2" />
              <circle cx="12" cy="3.2" r="1.5" />
              <circle cx="12" cy="20.8" r="1.5" />
              <circle cx="3.2" cy="12" r="1.5" />
              <circle cx="20.8" cy="12" r="1.5" />
              <circle cx="5.4" cy="5.4" r="1.3" />
              <circle cx="18.6" cy="5.4" r="1.3" />
              <circle cx="5.4" cy="18.6" r="1.3" />
              <circle cx="18.6" cy="18.6" r="1.3" />
            </svg>
          </span>
        ) : (
          <span className="stake-mines-symbol diamond-symbol" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <polygon points="12,2.8 19.3,9.7 12,21.2 4.7,9.7" />
              <polyline points="4.7,9.7 19.3,9.7" />
              <polyline points="8.5,6 12,21.2 15.5,6" />
            </svg>
          </span>
        )}
      </span>
    </button>
  );
}

function BlackVaultMines({ isGameDisabled, userBalance, applyBalanceDelta, token }) {
  const { muted, masterVolume, sfxVolume, setMuted, setSfxVolume, unlockAudio } = useSound();
  const [gridSize, setGridSize] = useState(5);
  const [mineCount, setMineCount] = useState(3);
  const [bet, setBet] = useState(10);

  const [stake, setStake] = useState(0);
  const [mineMap, setMineMap] = useState(new Set());
  const [revealed, setRevealed] = useState(new Set());
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('Set bet and mines then press Start.');
  const [multiplier, setMultiplier] = useState(1);
  const [isBusy, setIsBusy] = useState(false);

  const [sessionProfit, setSessionProfit] = useState(0);
  const [liveWin, setLiveWin] = useState(null);

  const [autoCashout, setAutoCashout] = useState(false);
  const [autoCashoutTarget, setAutoCashoutTarget] = useState(1.5);
  const [autoBet, setAutoBet] = useState(false);

  const [pressedTiles, setPressedTiles] = useState(new Set());
  const [flippingTiles, setFlippingTiles] = useState(new Set());
  const [backVisibleTiles, setBackVisibleTiles] = useState(new Set());
  const [shakingTiles, setShakingTiles] = useState(new Set());
  const [flashingTiles, setFlashingTiles] = useState(new Set());

  const [multPulse, setMultPulse] = useState(false);
  const [fairnessState, setFairnessState] = useState({ clientSeed: 'mines-client-seed', nonce: 0, hashedServerSeed: '' });

  const autoBetTimerRef = useRef(0);
  const liveWinTimerRef = useRef(0);

  const statusRef = useRef(status);
  const revealedRef = useRef(revealed);

  const sounds = useStakeMinesAudio(Math.max(0, Math.min(1, masterVolume * sfxVolume)), muted);

  const tileCount = gridSize * gridSize;
  const maxMines = Math.min(24, tileCount - 1);

  const safeRevealedCount = useMemo(
    () => Array.from(revealed).filter((index) => !mineMap.has(index)).length,
    [revealed, mineMap]
  );

  const potentialWin = useMemo(() => Number((stake * multiplier).toFixed(2)), [stake, multiplier]);
  const risk = useMemo(() => getRiskLabel(mineCount, gridSize), [mineCount, gridSize]);

  const animatedMultiplier = useAnimatedNumber(multiplier, 300);

  const gridClass = useMemo(() => {
    if (gridSize === 3) return 'grid-3';
    if (gridSize === 4) return 'grid-4';
    if (gridSize === 5) return 'grid-5';
    if (gridSize === 6) return 'grid-6';
    return 'grid-7';
  }, [gridSize]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);

  useEffect(() => {
    setMultPulse(true);
    const timer = window.setTimeout(() => setMultPulse(false), 180);
    return () => window.clearTimeout(timer);
  }, [multiplier]);

  const updateSet = (setter, index, shouldAdd) => {
    setter((prev) => {
      const next = new Set(prev);
      if (shouldAdd) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const clearTileFx = () => {
    setPressedTiles(new Set());
    setFlippingTiles(new Set());
    setBackVisibleTiles(new Set());
    setShakingTiles(new Set());
    setFlashingTiles(new Set());
  };

  const resetBoardState = () => {
    setMineMap(new Set());
    setRevealed(new Set());
    clearTileFx();
    setStake(0);
    setMultiplier(1);
    setStatus('idle');
    setMessage('Set bet and mines then press Start.');
  };

  const validateRevealOnServer = async (tileIndex) => {
    await new Promise((resolve) => window.setTimeout(resolve, 90));
    return statusRef.current === 'active' && !revealedRef.current.has(tileIndex);
  };

  const startGame = async () => {
    if (isGameDisabled || isBusy || status === 'active') return;
    if (bet <= 0 || mineCount >= tileCount) return;
    if (userBalance < bet) {
      setMessage('Insufficient balance.');
      return;
    }

    setIsBusy(true);
    unlockAudio();
    const debited = await applyBalanceDelta(-bet);
    if (!debited.ok) {
      setMessage('Bet failed. Try again.');
      setIsBusy(false);
      return;
    }

    setStake(bet);
    setMineMap(pickUniqueIndexes(tileCount, mineCount));
    setRevealed(new Set());
    clearTileFx();
    setMultiplier(1);
    setStatus('active');
    setMessage('Round active. Reveal tiles or cash out.');
    setSessionProfit((prev) => Number((prev - bet).toFixed(2)));
    setFairnessState((prev) => ({ ...prev, nonce: Number(prev.nonce || 0) + 1 }));
    setIsBusy(false);
  };

  const finishWithPayout = async (payout, nextStatus, nextMessage) => {
    await applyBalanceDelta(payout);
    setStatus(nextStatus);
    setMessage(nextMessage);
    setSessionProfit((prev) => Number((prev + payout).toFixed(2)));

    if (payout > stake) {
      setLiveWin(Number((payout - stake).toFixed(2)));
      window.clearTimeout(liveWinTimerRef.current);
      liveWinTimerRef.current = window.setTimeout(() => setLiveWin(null), 1800);
    }
  };

  const cashOut = async () => {
    if (status !== 'active' || safeRevealedCount < 1 || isBusy) return;

    setIsBusy(true);
    const payout = Number((stake * multiplier).toFixed(2));
    await finishWithPayout(payout, 'cashed_out', `Cashed out ${formatMoney(payout)} at ${multiplier.toFixed(4)}x.`);
    sounds.play('cashout_rise');
    setIsBusy(false);
  };

  const revealTile = (index) => {
    if (status !== 'active' || isBusy || revealed.has(index) || backVisibleTiles.has(index)) return;

    updateSet(setPressedTiles, index, true);
    window.setTimeout(() => updateSet(setPressedTiles, index, false), 80);

    updateSet(setFlippingTiles, index, true);

    const isMine = mineMap.has(index);
    const validationPromise = validateRevealOnServer(index);

    window.setTimeout(() => {
      updateSet(setBackVisibleTiles, index, true);
      if (isMine) {
        sounds.play('mine_thud');
      } else {
        sounds.play('diamond_tick', 20);
      }
    }, 90);

    window.setTimeout(async () => {
      const valid = await validationPromise;
      updateSet(setFlippingTiles, index, false);

      if (!valid) {
        updateSet(setBackVisibleTiles, index, false);
        setMessage('Reveal rejected by server validation.');
        return;
      }

      setRevealed((prev) => {
        const next = new Set(prev);
        next.add(index);
        return next;
      });

      if (isMine) {
        updateSet(setFlashingTiles, index, true);
        updateSet(setShakingTiles, index, true);
        window.setTimeout(() => updateSet(setFlashingTiles, index, false), 120);
        window.setTimeout(() => updateSet(setShakingTiles, index, false), 160);

        const showMines = new Set(revealedRef.current);
        mineMap.forEach((mineIndex) => {
          showMines.add(mineIndex);
          updateSet(setBackVisibleTiles, mineIndex, true);
        });
        setRevealed(showMines);

        setStatus('lost');
        setMessage('Mine hit. Round lost.');
        return;
      }

      const nextSafe = Array.from(new Set([...revealedRef.current, index])).filter((value) => !mineMap.has(value)).length;
      const nextMultiplier = getMultiplier(tileCount, mineCount, nextSafe, 0.01);
      setMultiplier(nextMultiplier);
      setMessage(`Safe tile. Multiplier ${nextMultiplier.toFixed(4)}x.`);

      const allSafe = tileCount - mineCount;
      if (nextSafe >= allSafe) {
        setIsBusy(true);
        const payout = Number((stake * nextMultiplier).toFixed(2));
        await finishWithPayout(payout, 'won', `All safe tiles found. Payout ${formatMoney(payout)}.`);
        sounds.play('cashout_rise');
        setIsBusy(false);
        return;
      }

      if (autoCashout && nextSafe > 0 && nextMultiplier >= autoCashoutTarget) {
        await cashOut();
      }
    }, 180);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void startGame();
      }
      if (event.code === 'Space') {
        event.preventDefault();
        void cashOut();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => {
    if (!autoBet || isBusy || status === 'active') return;

    window.clearTimeout(autoBetTimerRef.current);
    autoBetTimerRef.current = window.setTimeout(() => {
      if (!isGameDisabled && userBalance >= bet) {
        void startGame();
      }
    }, 700);

    return () => window.clearTimeout(autoBetTimerRef.current);
  }, [autoBet, status, isBusy, isGameDisabled, userBalance, bet]);

  useEffect(
    () => () => {
      window.clearTimeout(autoBetTimerRef.current);
      window.clearTimeout(liveWinTimerRef.current);
    },
    []
  );

  return (
    <section className="stake-mines-root">
      {liveWin !== null && <div className="stake-mines-livewin">+{formatMoney(liveWin)}</div>}

      <div className="stake-mines-container">
        <div className="stake-mines-left-panel">
          <div className={`stake-mines-grid ${gridClass}`}>
            {Array.from({ length: tileCount }, (_, index) => {
              const revealedTile = revealed.has(index);
              const mine = mineMap.has(index) && revealedTile;
              return (
                <StakeMinesTile
                  key={index}
                  index={index}
                  revealed={revealedTile}
                  backVisible={backVisibleTiles.has(index)}
                  pressed={pressedTiles.has(index)}
                  flipping={flippingTiles.has(index)}
                  mine={mine}
                  shake={shakingTiles.has(index)}
                  flash={flashingTiles.has(index)}
                  disabled={status !== 'active' || revealedTile || isBusy}
                  onReveal={revealTile}
                />
              );
            })}
          </div>
        </div>

        <aside className="stake-mines-right-panel">
          <div className="stake-mines-panel-group">
            <label>
              Bet
              <input
                type="number"
                min="1"
                step="1"
                value={bet}
                disabled={status === 'active' || isBusy}
                onChange={(event) => setBet(Number(event.target.value) || 1)}
              />
            </label>

            <label>
              Mines
              <input
                type="number"
                min="1"
                max={maxMines}
                value={mineCount}
                disabled={status === 'active' || isBusy}
                onChange={(event) => setMineCount(Math.max(1, Math.min(maxMines, Number(event.target.value) || 1)))}
              />
            </label>

            <Button className="stake-mines-start" onClick={() => void startGame()} disabled={isGameDisabled || status === 'active' || isBusy}>
              Start Game
            </Button>
          </div>

          <div className="stake-mines-panel-group stats-group">
            <div>
              <p>Balance</p>
              <strong>{formatMoney(userBalance)}</strong>
            </div>
            <div>
              <p>Session P/L</p>
              <strong>{formatMoney(sessionProfit)}</strong>
            </div>
            <div>
              <p title="Multiplier is based on combinatorial survival odds with 1% house edge.">Multiplier</p>
              <strong className={`stake-mines-multiplier ${multPulse ? 'is-pulse' : ''}`}>{animatedMultiplier.toFixed(4)}x</strong>
            </div>
            <div>
              <p>Potential Profit</p>
              <strong>{formatMoney(potentialWin - stake)}</strong>
            </div>
            <div>
              <p>Risk</p>
              <strong>{risk}</strong>
            </div>
          </div>

          <Button
            className="stake-mines-cashout"
            onClick={() => void cashOut()}
            disabled={status !== 'active' || safeRevealedCount < 1 || isBusy}
          >
            Cash Out
          </Button>

          <div className="stake-mines-panel-group auto-group">
            <label>
              <input type="checkbox" checked={autoCashout} onChange={(event) => setAutoCashout(event.target.checked)} />
              Auto Cashout
            </label>
            <input
              type="number"
              min="1.01"
              step="0.01"
              value={autoCashoutTarget}
              disabled={!autoCashout}
              onChange={(event) => setAutoCashoutTarget(Number(event.target.value) || 1.5)}
            />

            <label>
              <input type="checkbox" checked={autoBet} onChange={(event) => setAutoBet(event.target.checked)} />
              Auto Bet
            </label>

            <label>
              <input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} />
              Mute
            </label>

            <label className="volume-label">
              SFX
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={sfxVolume}
                onChange={(event) => setSfxVolume(Number(event.target.value))}
              />
            </label>
          </div>

          <p className="stake-mines-status">{message}</p>

          {status !== 'active' && status !== 'idle' && (
            <Button className="stake-mines-reset" variant="outline" onClick={resetBoardState}>
              Reset
            </Button>
          )}

          <FairnessPanel
            token={token}
            game="mines"
            fairnessState={fairnessState}
            onClientSeedChange={(value) => setFairnessState((prev) => ({ ...prev, clientSeed: value }))}
          />
        </aside>
      </div>
    </section>
  );
}

export default BlackVaultMines;
