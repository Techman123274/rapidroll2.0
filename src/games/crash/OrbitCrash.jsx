import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { api } from '../../services/api';
import FairnessPanel from '../../components/fairness/FairnessPanel';

const VOLUME_KEY = 'orbit_crash_volume';
const MUTE_KEY = 'orbit_crash_muted';

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

function useOrbitAudio(volume, muted) {
  const contextRef = useRef(null);
  const ambienceRef = useRef(null);
  const riseRef = useRef(null);

  const getContext = () => {
    if (contextRef.current) return contextRef.current;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    contextRef.current = new AudioCtx();
    return contextRef.current;
  };

  const scaleVolume = (v) => Math.max(0.0001, Math.min(1, v * volume * (muted ? 0 : 1)));

  const oneShot = (frequency, duration, type = 'sine', gain = 0.15) => {
    if (muted || volume <= 0) return;
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const start = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(scaleVolume(gain), start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  };

  const startAmbience = () => {
    if (muted || volume <= 0 || ambienceRef.current) return;
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(62, ctx.currentTime);
    amp.gain.setValueAtTime(scaleVolume(0.035), ctx.currentTime);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start();
    ambienceRef.current = { osc, amp };
  };

  const stopAmbience = () => {
    const node = ambienceRef.current;
    if (!node) return;
    try {
      node.amp.gain.exponentialRampToValueAtTime(0.0001, getContext().currentTime + 0.12);
      node.osc.stop(getContext().currentTime + 0.15);
    } catch {
      // noop
    }
    ambienceRef.current = null;
  };

  const startRise = () => {
    if (muted || volume <= 0 || riseRef.current) return;
    const ctx = getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    amp.gain.setValueAtTime(scaleVolume(0.03), ctx.currentTime);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start();
    riseRef.current = { osc, amp };
  };

  const setRiseMultiplier = (multiplier) => {
    const node = riseRef.current;
    if (!node) return;
    const ctx = getContext();
    const freq = Math.min(740, 110 + multiplier * 14);
    node.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.04);
  };

  const stopRise = () => {
    const node = riseRef.current;
    if (!node) return;
    try {
      const ctx = getContext();
      node.amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);
      node.osc.stop(ctx.currentTime + 0.1);
    } catch {
      // noop
    }
    riseRef.current = null;
  };

  useEffect(
    () => () => {
      stopAmbience();
      stopRise();
      if (contextRef.current && contextRef.current.state !== 'closed') {
        void contextRef.current.close();
      }
    },
    []
  );

  return {
    countdownTick() {
      oneShot(640, 0.06, 'triangle', 0.06);
    },
    launch() {
      oneShot(82, 0.24, 'sawtooth', 0.1);
      startRise();
    },
    setRiseMultiplier,
    cashout() {
      oneShot(520, 0.1, 'sine', 0.12);
      oneShot(760, 0.18, 'sine', 0.1);
    },
    crash() {
      stopRise();
      oneShot(90, 0.28, 'sawtooth', 0.16);
    },
    startAmbience,
    stopAmbience,
    stopRise
  };
}

function OrbitCrash({ isGameDisabled, userBalance, token, refreshUser, syncUser }) {
  const [phase, setPhase] = useState('countdown');
  const [countdownMs, setCountdownMs] = useState(0);
  const [roundId, setRoundId] = useState(null);
  const [multiplier, setMultiplier] = useState(1);
  const [status, setStatus] = useState('Preparing Orbit X engine...');
  const [bet, setBet] = useState(10);
  const [autoCashoutAt, setAutoCashoutAt] = useState(1.8);
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [myBet, setMyBet] = useState(null);
  const [liveBets, setLiveBets] = useState([]);
  const [crashHistory, setCrashHistory] = useState([]);
  const [sessionBetHistory, setSessionBetHistory] = useState([]);
  const [sessionProfit, setSessionProfit] = useState(0);
  const [lastPayout, setLastPayout] = useState(0);
  const [fairnessState, setFairnessState] = useState({ clientSeed: 'crash-client-seed', nonce: 0, hashedServerSeed: '' });
  const [flashCrash, setFlashCrash] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === 'true');
  const [volume, setVolume] = useState(() => {
    const value = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.6;
  });

  const [autoBetEnabled, setAutoBetEnabled] = useState(false);
  const [increaseOnLoss, setIncreaseOnLoss] = useState(20);
  const [resetOnWin, setResetOnWin] = useState(true);
  const [stopLoss, setStopLoss] = useState(150);
  const [stopProfit, setStopProfit] = useState(250);

  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const renderRafRef = useRef(0);
  const starsRef = useRef([]);
  const phaseRef = useRef('countdown');
  const multiplierRef = useRef(1);
  const activeCurveRef = useRef([]);
  const ghostCurvesRef = useRef([]);
  const roundStartedAtRef = useRef(0);
  const lastCountdownSecondRef = useRef(-1);
  const autoBetStakeRef = useRef(10);
  const autoBetLockedRef = useRef(false);
  const myBetRef = useRef(null);

  const audio = useOrbitAudio(volume, muted);

  const syncMyBet = async () => {
    if (!token) return;
    try {
      const data = await api.getMyCrashBet(token);
      setMyBet(data.bet);
      myBetRef.current = data.bet;
    } catch {
      setMyBet(null);
      myBetRef.current = null;
    }
  };

  useEffect(() => {
    myBetRef.current = myBet;
  }, [myBet]);

  const pushSessionEntry = (entry) => {
    setSessionBetHistory((prev) => [entry, ...prev].slice(0, 20));
  };

  const patchSessionEntry = (targetRoundId, patch) => {
    setSessionBetHistory((prev) => prev.map((row) => (row.roundId === targetRoundId ? { ...row, ...patch } : row)));
  };

  const recordOutcome = (isWin, payout = 0, crashAt = null, cashoutAt = null) => {
    if (!roundId || !myBetRef.current) return;
    const base = Number(myBetRef.current.betAmount || 0);
    const profit = Number((payout - base).toFixed(2));
    patchSessionEntry(roundId, {
      status: isWin ? 'won' : 'lost',
      payout,
      cashoutMultiplier: cashoutAt,
      crashMultiplier: crashAt,
      profit
    });
    setSessionProfit((prev) => Number((prev + profit).toFixed(2)));
    if (isWin) setLastPayout(payout);
  };

  const placeBet = async (overrideBet = null) => {
    if (!token || isBusy || phase !== 'countdown' || isGameDisabled) return false;
    const stake = Number(overrideBet ?? bet);
    if (stake <= 0) return false;
    if (userBalance < stake) {
      setStatus('Insufficient balance.');
      return false;
    }

    setIsBusy(true);
    try {
      const payload = {
        betAmount: stake,
        autoCashoutAt: autoCashoutEnabled ? Number(autoCashoutAt) : null
      };
      const data = await api.placeCrashBet(token, payload);
      if (data.user) {
        syncUser?.(data.user);
      } else {
        await refreshUser();
      }
      await syncMyBet();
      pushSessionEntry({
        roundId: data.roundId,
        betAmount: stake,
        status: 'active',
        payout: 0,
        cashoutMultiplier: null,
        crashMultiplier: null,
        profit: -stake
      });
      setStatus(`Bet accepted for ${data.roundId}.`);
      return true;
    } catch (error) {
      setStatus(error.message || 'Bet rejected.');
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const cancelBet = async () => {
    if (!token || !myBet || myBet.status !== 'active' || phase !== 'countdown') return;
    setIsBusy(true);
    try {
      const data = await api.cancelCrashBet(token);
      if (data.user) {
        syncUser?.(data.user);
      } else {
        await refreshUser();
      }
      await syncMyBet();
      patchSessionEntry(roundId, { status: 'cancelled', payout: Number(myBet.betAmount), profit: 0 });
      setStatus('Bet cancelled before launch.');
    } catch (error) {
      setStatus(error.message || 'Unable to cancel.');
    } finally {
      setIsBusy(false);
    }
  };

  const cashout = async () => {
    if (!token || !myBet || myBet.status !== 'active' || phase !== 'running') return;
    setIsBusy(true);
    try {
      const data = await api.cashoutCrashBet(token);
      if (data.user) {
        syncUser?.(data.user);
      } else {
        await refreshUser();
      }
      await syncMyBet();
      recordOutcome(true, Number(data.payout || 0), null, Number(data.cashoutAt || multiplierRef.current));
      audio.cashout();
      setStatus(`Cashed out at ${Number(data.cashoutAt).toFixed(2)}x`);
    } catch (error) {
      setStatus(error.message || 'Cashout failed.');
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    localStorage.setItem(VOLUME_KEY, String(volume));
  }, [volume]);

  useEffect(() => {
    localStorage.setItem(MUTE_KEY, String(muted));
  }, [muted]);

  useEffect(() => {
    let source = null;
    let mounted = true;

    const onEvent = (payload) => {
      if (!mounted) return;
      if (payload.history) setCrashHistory(payload.history);
      if (payload.liveBets) setLiveBets(payload.liveBets);
      if (payload.roundId) setRoundId(payload.roundId);

      if (payload.type === 'state') {
        setPhase(payload.phase || 'countdown');
        phaseRef.current = payload.phase || 'countdown';
        setCountdownMs(Number(payload.countdownMs || 0));
        setMultiplier(Number(payload.multiplier || 1));
        multiplierRef.current = Number(payload.multiplier || 1);
        setFairnessState((prev) => ({
          clientSeed: payload.clientSeed || prev.clientSeed,
          nonce: payload.nonce ?? prev.nonce,
          hashedServerSeed: payload.hashedServerSeed || prev.hashedServerSeed
        }));
        return;
      }

      if (payload.type === 'countdown') {
        setPhase('countdown');
        phaseRef.current = 'countdown';
        setCountdownMs(Number(payload.countdownMs || 0));
        setStatus('Betting open. Launch in progress...');
        setFairnessState((prev) => ({
          clientSeed: payload.clientSeed || prev.clientSeed,
          nonce: payload.nonce ?? prev.nonce,
          hashedServerSeed: payload.hashedServerSeed || prev.hashedServerSeed
        }));

        const sec = Math.ceil(Number(payload.countdownMs || 0) / 1000);
        if (sec !== lastCountdownSecondRef.current && sec > 0 && sec <= 6) {
          audio.countdownTick();
          lastCountdownSecondRef.current = sec;
        }
        if (autoBetEnabled && !myBetRef.current && !autoBetLockedRef.current) {
          autoBetLockedRef.current = true;
          void placeBet(autoBetStakeRef.current).finally(() => {
            autoBetLockedRef.current = false;
          });
        }
        return;
      }

      if (payload.type === 'start') {
        setPhase('running');
        phaseRef.current = 'running';
        setMultiplier(1);
        multiplierRef.current = 1;
        setStatus('Flight active.');
        roundStartedAtRef.current = performance.now();
        if (activeCurveRef.current.length > 2) {
          ghostCurvesRef.current = [activeCurveRef.current, ...ghostCurvesRef.current].slice(0, 5);
        }
        activeCurveRef.current = [];
        audio.launch();
        return;
      }

      if (payload.type === 'tick') {
        const next = Number(payload.multiplier || 1);
        setMultiplier(next);
        multiplierRef.current = next;
        audio.setRiseMultiplier(next);
        return;
      }

      if (payload.type === 'crash') {
        setPhase('crashed');
        phaseRef.current = 'crashed';
        setMultiplier(Number(payload.crashPoint || 1));
        multiplierRef.current = Number(payload.crashPoint || 1);
        setStatus(`Crashed at ${Number(payload.crashPoint || 1).toFixed(2)}x`);
        setFlashCrash(true);
        setTimeout(() => setFlashCrash(false), 120);
        audio.crash();

        if (myBetRef.current?.status === 'active') {
          recordOutcome(false, 0, Number(payload.crashPoint || 1), null);
        }
        void syncMyBet();
        void refreshUser();
        return;
      }

      if (payload.type === 'results') {
        setPhase('results');
        phaseRef.current = 'results';
        setStatus('Round settled. Next launch loading...');
        audio.stopRise();

        const activeBet = myBetRef.current;
        if (autoBetEnabled && activeBet && activeBet.status === 'lost') {
          autoBetStakeRef.current = Number((autoBetStakeRef.current * (1 + increaseOnLoss / 100)).toFixed(2));
        }
        if (autoBetEnabled && activeBet && activeBet.status === 'won' && resetOnWin) {
          autoBetStakeRef.current = Number(bet);
        }
      }
    };

    const open = async () => {
      try {
        const state = await api.getCrashState();
        onEvent({ type: 'state', ...state });
      } catch {
        setStatus('Unable to load crash state.');
      }
      await syncMyBet();

      source = new EventSource('/api/crash/stream');
      source.onmessage = (event) => {
        try {
          onEvent(JSON.parse(event.data));
        } catch {
          // noop
        }
      };
      source.onerror = () => {
        setStatus('Orbit stream reconnecting...');
      };
    };

    open();
    audio.startAmbience();

    return () => {
      mounted = false;
      if (source) source.close();
      audio.stopAmbience();
      audio.stopRise();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, autoBetEnabled, increaseOnLoss, resetOnWin, bet, autoCashoutAt, autoCashoutEnabled]);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const wrap = wrapperRef.current;
      if (!canvas || !wrap) {
        renderRafRef.current = window.requestAnimationFrame(draw);
        return;
      }

      const width = wrap.clientWidth;
      const height = wrap.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        renderRafRef.current = window.requestAnimationFrame(draw);
        return;
      }

      if (starsRef.current.length === 0) {
        starsRef.current = Array.from({ length: 120 }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          r: Math.random() * 1.7 + 0.2,
          speed: Math.random() * 0.26 + 0.08,
          alpha: Math.random() * 0.5 + 0.2
        }));
      }

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, width, height);

      // subtle center haze
      const radial = ctx.createRadialGradient(width / 2, height * 0.5, 10, width / 2, height * 0.5, width * 0.55);
      radial.addColorStop(0, 'rgba(255,255,255,0.04)');
      radial.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, width, height);

      // stars
      starsRef.current.forEach((star) => {
        star.y -= star.speed;
        if (star.y < -2) {
          star.y = height + 2;
          star.x = Math.random() * width;
        }
        ctx.fillStyle = `rgba(255,255,255,${star.alpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // graph area
      const pad = 18;
      const gx = pad;
      const gy = pad;
      const gw = width - pad * 2;
      const gh = height - pad * 2;

      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i += 1) {
        const y = gy + (gh / 7) * i;
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.lineTo(gx + gw, y);
        ctx.stroke();
      }
      for (let i = 0; i < 9; i += 1) {
        const x = gx + (gw / 8) * i;
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.lineTo(x, gy + gh);
        ctx.stroke();
      }

      const elapsedSec = Math.max(0, (performance.now() - roundStartedAtRef.current) / 1000);
      if (phaseRef.current === 'running' || phaseRef.current === 'crashed' || phaseRef.current === 'results') {
        const x = Math.min(gx + gw - 2, gx + elapsedSec * 85);
        const y = gy + gh - Math.min(gh - 4, Math.log(Math.max(1, multiplierRef.current)) * 62 + 6);
        activeCurveRef.current.push({ x, y });
        if (activeCurveRef.current.length > 450) {
          activeCurveRef.current.shift();
        }
      }

      // ghost curves
      ghostCurvesRef.current.forEach((curve) => {
        if (!curve || curve.length < 2) return;
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(curve[0].x, curve[0].y);
        for (let i = 1; i < curve.length; i += 1) {
          ctx.lineTo(curve[i].x, curve[i].y);
        }
        ctx.stroke();
      });

      // active curve
      if (activeCurveRef.current.length > 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(activeCurveRef.current[0].x, activeCurveRef.current[0].y);
        for (let i = 1; i < activeCurveRef.current.length; i += 1) {
          ctx.lineTo(activeCurveRef.current[i].x, activeCurveRef.current[i].y);
        }
        ctx.stroke();
      }

      // crash drop
      if (phaseRef.current === 'crashed' && activeCurveRef.current.length > 0) {
        const tail = activeCurveRef.current[activeCurveRef.current.length - 1];
        ctx.strokeStyle = 'rgba(255,60,60,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.lineTo(tail.x, gy + gh);
        ctx.stroke();
      }

      // rocket
      if (phaseRef.current === 'running' && activeCurveRef.current.length > 0) {
        const tail = activeCurveRef.current[activeCurveRef.current.length - 1];
        ctx.save();
        ctx.translate(tail.x, tail.y);
        ctx.fillStyle = '#f0f0f0';
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-6, 6);
        ctx.lineTo(0, -12);
        ctx.lineTo(6, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,165,70,0.35)';
        ctx.beginPath();
        ctx.arc(0, 9, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      renderRafRef.current = window.requestAnimationFrame(draw);
    };

    renderRafRef.current = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(renderRafRef.current);
  }, []);

  const multiplierClass = useMemo(() => {
    if (phase === 'crashed') return 'is-crashed';
    if (multiplier >= 100) return 'is-gold';
    if (multiplier >= 10) return 'is-glow';
    if (multiplier >= 2) return 'is-green';
    return '';
  }, [phase, multiplier]);

  const mainActionLabel =
    phase === 'running' && myBet?.status === 'active' ? 'Cash Out' : phase === 'countdown' && myBet?.status === 'active' ? 'Cancel' : 'Bet';

  const onMainAction = () => {
    if (mainActionLabel === 'Cash Out') return void cashout();
    if (mainActionLabel === 'Cancel') return void cancelBet();
    return void placeBet();
  };

  const actionClass = mainActionLabel === 'Cash Out' ? 'cashout' : mainActionLabel === 'Cancel' ? 'cancel' : 'bet';

  return (
    <Card className={`orbit-crash-root phase-${phase}`}>
      {/* FLIGHT AREA */}
      <section className="orbit-flight" ref={wrapperRef}>
        <canvas ref={canvasRef} className="orbit-canvas" />
        <div className={`orbit-multiplier ${multiplierClass}`}>{multiplier.toFixed(2)}x</div>
        <div className="orbit-status">{status}</div>
        <div className="orbit-countdown">T-{(countdownMs / 1000).toFixed(1)}s</div>
        {flashCrash && <div className="orbit-crash-flash" />}
      </section>

      {/* HISTORY STRIP */}
      <section className="orbit-history-strip">
        {crashHistory.slice(0, 24).map((item) => {
          const value = Number(item.crashPoint);
          const tier = value < 2 ? 'low' : value < 10 ? 'mid' : value < 100 ? 'high' : 'mega';
          return (
            <span key={item.roundId} className={`orbit-pill ${tier}`}>
              {value.toFixed(2)}x
            </span>
          );
        })}
      </section>

      {/* CONTROL PANELS */}
      <section className="orbit-panels">
        <div className="orbit-panel">
          <h3>Bet Panel A</h3>
          <label>
            Bet
            <input
              type="number"
              min="1"
              step="1"
              value={bet}
              disabled={isBusy || phase === 'running'}
              onChange={(event) => {
                const next = Number(event.target.value) || 1;
                setBet(next);
                autoBetStakeRef.current = next;
              }}
            />
          </label>
          <label>
            Auto Cashout
            <input
              type="number"
              min="1.01"
              step="0.01"
              value={autoCashoutAt}
              disabled={!autoCashoutEnabled || phase === 'running'}
              onChange={(event) => setAutoCashoutAt(Math.max(1.01, Number(event.target.value) || 1.01))}
            />
          </label>
          <label className="orbit-check">
            <input
              type="checkbox"
              checked={autoCashoutEnabled}
              disabled={phase === 'running'}
              onChange={(event) => setAutoCashoutEnabled(event.target.checked)}
            />
            Auto Cashout Enabled
          </label>
          <Button className={`orbit-main-btn ${actionClass}`} onClick={onMainAction} disabled={isBusy || isGameDisabled}>
            {mainActionLabel}
          </Button>
          <div className="orbit-stats">
            <p>
              <span>Balance</span>
              <strong>{formatMoney(userBalance)}</strong>
            </p>
            <p>
              <span>Bet</span>
              <strong>{formatMoney(myBet?.betAmount || 0)}</strong>
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
        </div>

        <div className="orbit-panel">
          <h3>Bet Panel B</h3>
          <label className="orbit-check">
            <input type="checkbox" checked={autoBetEnabled} onChange={(event) => setAutoBetEnabled(event.target.checked)} />
            Auto Bet
          </label>
          <label>
            Increase On Loss %
            <input
              type="number"
              min="0"
              step="1"
              value={increaseOnLoss}
              onChange={(event) => setIncreaseOnLoss(Math.max(0, Number(event.target.value) || 0))}
            />
          </label>
          <label className="orbit-check">
            <input type="checkbox" checked={resetOnWin} onChange={(event) => setResetOnWin(event.target.checked)} />
            Reset On Win
          </label>
          <label>
            Stop Loss
            <input type="number" min="0" step="1" value={stopLoss} onChange={(event) => setStopLoss(Number(event.target.value) || 0)} />
          </label>
          <label>
            Stop Profit
            <input
              type="number"
              min="0"
              step="1"
              value={stopProfit}
              onChange={(event) => setStopProfit(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            Volume
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
          </label>
          <label className="orbit-check">
            <input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} />
            Mute
          </label>
        </div>

        <div className="orbit-panel">
          <h3>Live Feed</h3>
          <div className="orbit-live-feed">
            {liveBets.slice(0, 24).map((betRow) => (
              <article key={betRow.id} className={`orbit-live-row ${betRow.status}`}>
                <strong>{betRow.username}</strong>
                <span>{formatMoney(betRow.betAmount)}</span>
                <em>{betRow.cashoutAt ? `${betRow.cashoutAt.toFixed(2)}x` : '--'}</em>
                <b>{formatMoney((betRow.payout || 0) - (betRow.betAmount || 0))}</b>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* SESSION BETS */}
      <section className="orbit-session-history">
        <div className="orbit-session-head">
          <h3>Session Bet History</h3>
          <span>{sessionBetHistory.length}/20</span>
        </div>
        <div className="orbit-session-list">
          {sessionBetHistory.map((row, idx) => (
            <article key={`${row.roundId}-${idx}`} className={`orbit-session-row ${row.status}`}>
              <p>{row.roundId}</p>
              <p>{formatMoney(row.betAmount)}</p>
              <p>{row.cashoutMultiplier ? `${Number(row.cashoutMultiplier).toFixed(2)}x` : row.crashMultiplier ? `${Number(row.crashMultiplier).toFixed(2)}x` : '--'}</p>
              <p>{formatMoney(row.payout || 0)}</p>
              <p>{formatMoney(row.profit || 0)}</p>
              <p>{row.status}</p>
            </article>
          ))}
        </div>
        <FairnessPanel
          token={token}
          game="crash"
          fairnessState={fairnessState}
          onClientSeedChange={(value) => setFairnessState((prev) => ({ ...prev, clientSeed: value }))}
        />
      </section>
    </Card>
  );
}

export default OrbitCrash;
