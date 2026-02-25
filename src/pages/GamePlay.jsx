import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import BlackVaultMines from '../games/mines/BlackVaultMines';
import { api } from '../services/api';
import OrbitCrash from '../games/crash/OrbitCrash';
import DiceRush from '../games/dice/DiceRush';
import RoulettePro from '../games/roulette/RoulettePro';
import LimboVault from '../games/limbo/LimboVault';
import PlinkoDrop from '../games/plinko/PlinkoDrop';
import TowersX from '../games/towers/TowersX';
import SlotGamePage from '../games/slots/SlotGamePage';
import { isSlotSlug, slotGameBySlug } from '../data/slotGames';

const cardRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const cardSuits = ['S', 'H', 'D', 'C'];

const rankWeight = {
  A: 11,
  K: 10,
  Q: 10,
  J: 10,
  10: 10,
  9: 9,
  8: 8,
  7: 7,
  6: 6,
  5: 5,
  4: 4,
  3: 3,
  2: 2
};

const suitMeta = {
  S: { icon: '♠', colorClass: 'card-suit-black' },
  C: { icon: '♣', colorClass: 'card-suit-black' },
  H: { icon: '♥', colorClass: 'card-suit-red' },
  D: { icon: '♦', colorClass: 'card-suit-red' }
};

const isBlackjackGame = (slug) => slug === 'blackjack-live' || slug === 'blackvault-blackjack';
const isMinesGame = (slug) => slug === 'mines-master';
const isCrashGame = (slug) => slug === 'crash-zone';
const isDiceGame = (slug) => slug === 'dice-rush';
const isRouletteGame = (slug) => slug === 'roulette-pro';
const isLimboGame = (slug) => slug === 'limbo-vault';
const isPlinkoGame = (slug) => slug === 'plinko-drop';
const isTowersGame = (slug) => slug === 'towers-x';

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

const createDeck = (roundSeed) => {
  const deck = [];
  let index = 0;

  for (const suit of cardSuits) {
    for (const rank of cardRanks) {
      deck.push({ rank, suit, code: `${rank}${suit}`, uid: `${roundSeed}-${rank}${suit}-${index}` });
      index += 1;
    }
  }

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
};

const handTotal = (hand) => {
  let total = hand.reduce((sum, card) => sum + rankWeight[card.rank], 0);
  let aceCount = hand.filter((card) => card.rank === 'A').length;

  while (total > 21 && aceCount > 0) {
    total -= 10;
    aceCount -= 1;
  }

  return total;
};

function useGameAudio() {
  const audioContextRef = useRef(null);

  const activate = () => {
    if (audioContextRef.current) return audioContextRef.current;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContextRef.current = new AudioCtx();
    return audioContextRef.current;
  };

  const tone = (frequency, duration, type = 'sine', gainValue = 0.03, delay = 0) => {
    const ctx = activate();
    if (!ctx) return;

    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + duration + 0.02);
  };

  return {
    activate,
    card() {
      tone(230, 0.045, 'square', 0.024);
      tone(175, 0.06, 'triangle', 0.016, 0.02);
    },
    gem() {
      tone(450, 0.06, 'triangle', 0.025);
      tone(640, 0.08, 'sine', 0.02, 0.05);
    },
    mine() {
      tone(150, 0.12, 'sawtooth', 0.032);
      tone(100, 0.14, 'sawtooth', 0.03, 0.06);
    },
    cashout() {
      tone(380, 0.08, 'sine', 0.03);
      tone(560, 0.1, 'sine', 0.028, 0.08);
      tone(760, 0.12, 'sine', 0.026, 0.16);
    },
    win() {
      tone(420, 0.08, 'sine', 0.032);
      tone(620, 0.08, 'sine', 0.03, 0.08);
      tone(780, 0.11, 'sine', 0.028, 0.16);
    },
    lose() {
      tone(240, 0.11, 'sawtooth', 0.03);
      tone(160, 0.12, 'sawtooth', 0.028, 0.09);
    },
    push() {
      tone(360, 0.08, 'triangle', 0.02);
      tone(360, 0.08, 'triangle', 0.02, 0.11);
    }
  };
}

function PlayingCard({ card, hidden = false }) {
  if (hidden) {
    return (
      <div className="blackjack-card blackjack-card-back" aria-label="Hidden card">
        <span className="card-back-pattern" />
      </div>
    );
  }

  const suit = suitMeta[card.suit];

  return (
    <div className={`blackjack-card blackjack-card-front ${suit.colorClass}`} aria-label={`${card.rank} ${card.suit}`}>
      <span className="card-corner card-corner-top">
        <strong>{card.rank}</strong>
        <em>{suit.icon}</em>
      </span>
      <span className="card-center">{suit.icon}</span>
      <span className="card-corner card-corner-bottom">
        <strong>{card.rank}</strong>
        <em>{suit.icon}</em>
      </span>
    </div>
  );
}

function BlackjackTable({ isGameDisabled, userBalance, applyBalanceDelta }) {
  const [deck, setDeck] = useState([]);
  const [playerHand, setPlayerHand] = useState([]);
  const [dealerHand, setDealerHand] = useState([]);
  const [isRoundActive, setIsRoundActive] = useState(false);
  const [isDealerRevealed, setIsDealerRevealed] = useState(false);
  const [canDouble, setCanDouble] = useState(false);
  const [status, setStatus] = useState('Press Deal to start a new Blackjack round.');
  const [baseBet, setBaseBet] = useState(25);
  const [roundBet, setRoundBet] = useState(0);
  const [resultTone, setResultTone] = useState('neutral');
  const [lastPayout, setLastPayout] = useState(0);
  const [isBusy, setIsBusy] = useState(false);

  const roundRef = useRef(0);
  const audio = useGameAudio();

  const playerTotal = handTotal(playerHand);
  const dealerVisibleTotal = handTotal(dealerHand.slice(0, 1));
  const dealerTotal = handTotal(dealerHand);
  const displayedDealerScore = isDealerRevealed || !isRoundActive ? dealerTotal : `${dealerVisibleTotal}+`;

  const drawCard = (nextDeck) => {
    const updated = [...nextDeck];
    const card = updated.shift();
    return { card, nextDeck: updated };
  };

  const settleRound = async ({ player, dealer, stake, prefix = '', blackjackWin = false }) => {
    const finalPlayerTotal = handTotal(player);
    const finalDealerTotal = handTotal(dealer);

    setIsRoundActive(false);
    setCanDouble(false);
    setIsDealerRevealed(true);

    if (finalPlayerTotal > 21) {
      setResultTone('lose');
      setLastPayout(0);
      setStatus(`${prefix}Bust at ${finalPlayerTotal}. Dealer wins.`.trim());
      audio.lose();
      return;
    }

    if (finalDealerTotal > 21 || finalPlayerTotal > finalDealerTotal) {
      const payout = blackjackWin ? Number((stake * 2.5).toFixed(2)) : Number((stake * 2).toFixed(2));
      await applyBalanceDelta(payout);
      setResultTone('win');
      setLastPayout(payout);
      setStatus(`${prefix}You win${blackjackWin ? ' with Blackjack' : ''}. Payout ${formatMoney(payout)}.`.trim());
      audio.win();
      return;
    }

    if (finalPlayerTotal < finalDealerTotal) {
      setResultTone('lose');
      setLastPayout(0);
      setStatus(`${prefix}Dealer wins this hand.`.trim());
      audio.lose();
      return;
    }

    await applyBalanceDelta(stake);
    setResultTone('push');
    setLastPayout(stake);
    setStatus(`${prefix}Push. Bet ${formatMoney(stake)} returned.`.trim());
    audio.push();
  };

  const runDealerTurn = async (startingPlayer, startingDealer, startingDeck, stake, prefix) => {
    let workingDealer = [...startingDealer];
    let workingDeck = [...startingDeck];

    while (handTotal(workingDealer) < 17) {
      const pull = drawCard(workingDeck);
      if (!pull.card) break;
      workingDealer = [...workingDealer, pull.card];
      workingDeck = pull.nextDeck;
      audio.card();
    }

    setDealerHand(workingDealer);
    setDeck(workingDeck);
    await settleRound({ player: startingPlayer, dealer: workingDealer, stake, prefix });
  };

  const startRound = async () => {
    if (isGameDisabled || baseBet <= 0 || isBusy) return;
    if (userBalance < baseBet) {
      setStatus('Insufficient balance for this bet.');
      return;
    }

    setIsBusy(true);
    const debited = await applyBalanceDelta(-baseBet);
    if (!debited.ok) {
      setStatus('Unable to place bet.');
      setIsBusy(false);
      return;
    }

    audio.activate();
    setResultTone('neutral');
    setLastPayout(0);
    setRoundBet(baseBet);

    roundRef.current += 1;

    const freshDeck = createDeck(roundRef.current);
    const first = drawCard(freshDeck);
    const second = drawCard(first.nextDeck);
    const third = drawCard(second.nextDeck);
    const fourth = drawCard(third.nextDeck);

    const nextPlayer = [first.card, third.card];
    const nextDealer = [second.card, fourth.card];

    setDeck(fourth.nextDeck);
    setPlayerHand(nextPlayer);
    setDealerHand(nextDealer);
    setIsRoundActive(true);
    setIsDealerRevealed(false);
    setCanDouble(true);
    setStatus('Round active. Hit, Stand, or Double.');

    audio.card();
    audio.card();

    const playerScore = handTotal(nextPlayer);
    const dealerScore = handTotal(nextDealer);

    if (playerScore === 21 && dealerScore === 21) {
      setIsDealerRevealed(true);
      await applyBalanceDelta(baseBet);
      setIsRoundActive(false);
      setCanDouble(false);
      setResultTone('push');
      setLastPayout(baseBet);
      setStatus(`Both have Blackjack. Push. Bet ${formatMoney(baseBet)} returned.`);
      audio.push();
      setIsBusy(false);
      return;
    }

    if (playerScore === 21) {
      await settleRound({ player: nextPlayer, dealer: nextDealer, stake: baseBet, blackjackWin: true });
      setIsBusy(false);
      return;
    }

    if (dealerScore === 21) {
      await settleRound({ player: nextPlayer, dealer: nextDealer, stake: baseBet });
      setIsBusy(false);
      return;
    }

    setIsBusy(false);
  };

  const hit = async () => {
    if (!isRoundActive || isGameDisabled || isBusy) return;

    const pull = drawCard(deck);
    if (!pull.card) return;

    setIsBusy(true);
    audio.activate();
    audio.card();

    const nextPlayer = [...playerHand, pull.card];
    setDeck(pull.nextDeck);
    setPlayerHand(nextPlayer);
    setCanDouble(false);

    const nextTotal = handTotal(nextPlayer);
    if (nextTotal > 21) {
      await settleRound({ player: nextPlayer, dealer: dealerHand, stake: roundBet });
      setIsBusy(false);
      return;
    }

    if (nextTotal === 21) {
      await runDealerTurn(nextPlayer, dealerHand, pull.nextDeck, roundBet, '21 reached. ');
    }

    setIsBusy(false);
  };

  const stand = async () => {
    if (!isRoundActive || isGameDisabled || isBusy) return;
    setIsBusy(true);
    audio.activate();
    await runDealerTurn(playerHand, dealerHand, deck, roundBet, 'Stand. ');
    setIsBusy(false);
  };

  const doubleDown = async () => {
    if (!isRoundActive || isGameDisabled || !canDouble || playerHand.length !== 2 || isBusy) return;
    if (userBalance < roundBet) {
      setStatus('Insufficient balance to double down.');
      return;
    }

    setIsBusy(true);
    const debited = await applyBalanceDelta(-roundBet);
    if (!debited.ok) {
      setStatus('Unable to double down.');
      setIsBusy(false);
      return;
    }

    const pull = drawCard(deck);
    if (!pull.card) {
      setIsBusy(false);
      return;
    }

    audio.activate();
    audio.card();

    const nextBet = Number((roundBet * 2).toFixed(2));
    const nextPlayer = [...playerHand, pull.card];
    const nextTotal = handTotal(nextPlayer);

    setRoundBet(nextBet);
    setDeck(pull.nextDeck);
    setPlayerHand(nextPlayer);
    setCanDouble(false);

    if (nextTotal > 21) {
      await settleRound({ player: nextPlayer, dealer: dealerHand, stake: nextBet, prefix: 'Double down. ' });
      setIsBusy(false);
      return;
    }

    await runDealerTurn(nextPlayer, dealerHand, pull.nextDeck, nextBet, 'Double down. ');
    setIsBusy(false);
  };

  return (
    <Card className={`game-play-card blackjack-table blackjack-result-${resultTone}`}>
      <header className="blackjack-table-head">
        <h2>Blackjack Table</h2>
        <div className="blackjack-meta">
          <label className="blackjack-bet-label" htmlFor="blackjack-bet">
            Bet
          </label>
          <input
            id="blackjack-bet"
            className="blackjack-bet-input"
            type="number"
            min="1"
            step="1"
            value={baseBet}
            onChange={(event) => setBaseBet(Number(event.target.value) || 1)}
            disabled={isRoundActive || isGameDisabled || isBusy}
          />
          <span className="blackjack-chip">Balance: {formatMoney(userBalance)}</span>
          <span className="blackjack-chip">Round Bet: {formatMoney(roundBet)}</span>
          <span className="blackjack-chip">Last Payout: {formatMoney(lastPayout)}</span>
        </div>
      </header>

      <section className="blackjack-row">
        <div className="blackjack-row-head">
          <h3>Dealer</h3>
          <span>Score: {displayedDealerScore}</span>
        </div>
        <div className="blackjack-cards">
          {dealerHand.length === 0 ? (
            <div className="blackjack-empty">Waiting for deal...</div>
          ) : (
            dealerHand.map((card, idx) => {
              const hidden = isRoundActive && !isDealerRevealed && idx === 1;
              return (
                <div key={card.uid} className="blackjack-card-wrap">
                  <PlayingCard card={card} hidden={hidden} />
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="blackjack-row">
        <div className="blackjack-row-head">
          <h3>Player</h3>
          <span>Score: {playerTotal || 0}</span>
        </div>
        <div className="blackjack-cards">
          {playerHand.length === 0 ? (
            <div className="blackjack-empty">No cards yet.</div>
          ) : (
            playerHand.map((card) => (
              <div key={card.uid} className="blackjack-card-wrap">
                <PlayingCard card={card} />
              </div>
            ))
          )}
        </div>
      </section>

      <p className="blackjack-status">{status}</p>

      <div className="wallet-actions blackjack-actions">
        <Button onClick={() => void startRound()} disabled={isGameDisabled || isRoundActive || isBusy}>
          Deal
        </Button>
        <Button onClick={() => void hit()} disabled={isGameDisabled || !isRoundActive || isBusy}>
          Hit
        </Button>
        <Button onClick={() => void stand()} disabled={isGameDisabled || !isRoundActive || isBusy} variant="outline">
          Stand
        </Button>
        <Button
          onClick={() => void doubleDown()}
          disabled={isGameDisabled || !isRoundActive || !canDouble || isBusy}
          variant="outline"
        >
          Double
        </Button>
      </div>
    </Card>
  );
}

function CrashZone({ isGameDisabled, userBalance, token, refreshUser }) {
  const [bet, setBet] = useState(10);
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(false);
  const [autoCashoutAt, setAutoCashoutAt] = useState(1.5);
  const [phase, setPhase] = useState('countdown');
  const [multiplier, setMultiplier] = useState(1);
  const [countdownMs, setCountdownMs] = useState(0);
  const [status, setStatus] = useState('Waiting for next Orbit Crash round.');
  const [roundId, setRoundId] = useState(null);
  const [myBet, setMyBet] = useState(null);
  const [history, setHistory] = useState([]);
  const [liveBets, setLiveBets] = useState([]);
  const [sessionBetHistory, setSessionBetHistory] = useState([]);
  const [sessionProfit, setSessionProfit] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [lastPayout, setLastPayout] = useState(0);

  const audio = useGameAudio();

  const pushSessionEntry = (entry) => {
    setSessionBetHistory((prev) => [entry, ...prev].slice(0, 20));
  };

  const patchSessionEntry = (targetRoundId, patch) => {
    setSessionBetHistory((prev) => prev.map((row) => (row.roundId === targetRoundId ? { ...row, ...patch } : row)));
  };

  const syncMyBet = async () => {
    if (!token) return;
    try {
      const data = await api.getMyCrashBet(token);
      setMyBet(data.bet);
    } catch {
      setMyBet(null);
    }
  };

  const handleStreamEvent = (payload) => {
    const type = payload.type;
    if (payload.history) setHistory(payload.history);
    if (payload.liveBets) setLiveBets(payload.liveBets);
    if (payload.roundId) setRoundId(payload.roundId);

    if (type === 'state') {
      setPhase(payload.phase || 'countdown');
      setMultiplier(Number(payload.multiplier || 1));
      setCountdownMs(Number(payload.countdownMs || 0));
      return;
    }

    if (type === 'countdown') {
      setPhase('countdown');
      setCountdownMs(Number(payload.countdownMs || 0));
      setStatus('Betting open. Round starts soon.');
      return;
    }

    if (type === 'start') {
      setPhase('running');
      setMultiplier(Number(payload.multiplier || 1));
      setStatus('Round live. Cash out before crash.');
      audio.activate();
      return;
    }

    if (type === 'tick') {
      setPhase('running');
      setMultiplier(Number(payload.multiplier || 1));
      return;
    }

    if (type === 'crash') {
      setPhase('crashed');
      setMultiplier(Number(payload.crashPoint || 1));
      setStatus(`Crashed at ${Number(payload.crashPoint || 1).toFixed(2)}x.`);
      if (myBet?.status === 'active' && roundId && roundId === payload.roundId) {
        patchSessionEntry(roundId, {
          status: 'lost',
          crashMultiplier: Number(payload.crashPoint || 1),
          payout: 0,
          profit: Number((-myBet.betAmount).toFixed(2))
        });
      }
      audio.lose();
      void syncMyBet();
      void refreshUser();
    }
  };

  useEffect(() => {
    let source = null;
    let closed = false;

    const open = async () => {
      try {
        const state = await api.getCrashState();
        handleStreamEvent({ type: 'state', ...state });
      } catch {
        setStatus('Unable to load crash state.');
      }

      source = new EventSource('/api/crash/stream');
      source.onmessage = (event) => {
        if (closed) return;
        try {
          const payload = JSON.parse(event.data);
          handleStreamEvent(payload);
        } catch {
          // ignore malformed event
        }
      };
      source.onerror = () => {
        if (!closed) setStatus('Live stream disconnected. Reconnecting...');
      };
    };

    open();
    void syncMyBet();
    return () => {
      closed = true;
      if (source) source.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const placeBet = async () => {
    if (!token || isGameDisabled || isBusy || phase !== 'countdown') return;
    if (bet <= 0) return;
    setIsBusy(true);
    try {
      const payload = {
        betAmount: Number(bet),
        autoCashoutAt: autoCashoutEnabled ? Number(autoCashoutAt) : null
      };
      const response = await api.placeCrashBet(token, payload);
      await refreshUser();
      await syncMyBet();
      setStatus('Bet placed.');
      pushSessionEntry({
        roundId: response.roundId,
        betAmount: Number(bet),
        status: 'active',
        payout: 0,
        profit: Number((-bet).toFixed(2)),
        cashoutMultiplier: null,
        crashMultiplier: null
      });
    } catch (error) {
      setStatus(error.message || 'Failed to place bet.');
    } finally {
      setIsBusy(false);
    }
  };

  const cancelBet = async () => {
    if (!token || isBusy || !myBet || myBet.status !== 'active' || phase !== 'countdown') return;
    setIsBusy(true);
    try {
      await api.cancelCrashBet(token);
      await refreshUser();
      await syncMyBet();
      if (roundId) {
        patchSessionEntry(roundId, {
          status: 'cancelled',
          payout: myBet.betAmount,
          profit: 0
        });
      }
      setStatus('Bet cancelled.');
    } catch (error) {
      setStatus(error.message || 'Failed to cancel.');
    } finally {
      setIsBusy(false);
    }
  };

  const cashout = async () => {
    if (!token || isBusy || phase !== 'running' || !myBet || myBet.status !== 'active') return;
    setIsBusy(true);
    try {
      const data = await api.cashoutCrashBet(token);
      await refreshUser();
      await syncMyBet();
      setLastPayout(Number(data.payout || 0));
      setSessionProfit((prev) => Number((prev + Number(data.payout || 0)).toFixed(2)));
      if (roundId) {
        patchSessionEntry(roundId, {
          status: 'won',
          cashoutMultiplier: Number(data.cashoutAt || multiplier),
          payout: Number(data.payout || 0),
          profit: Number((Number(data.payout || 0) - Number(myBet.betAmount || 0)).toFixed(2))
        });
      }
      setStatus(`Cashed out at ${Number(data.cashoutAt || multiplier).toFixed(2)}x.`);
      audio.cashout();
    } catch (error) {
      setStatus(error.message || 'Cashout failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const mainActionLabel =
    phase === 'running' ? 'Cash Out' : myBet?.status === 'active' && phase === 'countdown' ? 'Cancel' : 'Bet';

  const onMainAction = () => {
    if (mainActionLabel === 'Cash Out') {
      void cashout();
      return;
    }
    if (mainActionLabel === 'Cancel') {
      void cancelBet();
      return;
    }
    void placeBet();
  };

  const actionClass =
    mainActionLabel === 'Cash Out' ? 'action-cashout' : mainActionLabel === 'Cancel' ? 'action-cancel' : 'action-bet';

  const riskLabel = useMemo(() => {
    if (autoCashoutAt <= 1.4) return 'Low';
    if (autoCashoutAt <= 2.2) return 'Medium';
    if (autoCashoutAt <= 4) return 'High';
    return 'Extreme';
  }, [autoCashoutAt]);

  const potentialProfit = Number((bet * Math.max(0, autoCashoutAt - 1)).toFixed(2));

  return (
    <Card className={`game-play-card crash-zone-card crash-state-${phase}`}>
      <div className="crash-zone-layout">
        <section className="crash-zone-left">
          <p className="crash-zone-label">Orbit Multiplier</p>
          <h2 className="crash-zone-multiplier">{multiplier.toFixed(2)}x</h2>
          <div className="crash-zone-track">
            <span className="crash-zone-progress" />
          </div>
          <p className="crash-zone-status">{status}</p>
          <p className="crash-zone-label">Countdown: {(countdownMs / 1000).toFixed(1)}s</p>

          <section className="crash-history-strip">
            {history.map((row) => (
              <span
                key={row.roundId}
                className={`crash-chip ${row.crashPoint < 2 ? 'chip-red' : row.crashPoint < 10 ? 'chip-yellow' : 'chip-green'}`}
              >
                {Number(row.crashPoint).toFixed(2)}x
              </span>
            ))}
          </section>
        </section>

        <aside className="crash-zone-right">
          <div className="crash-zone-group">
            <label htmlFor="crash-bet">Bet</label>
            <input
              id="crash-bet"
              type="number"
              min="1"
              step="1"
              value={bet}
              disabled={phase === 'running' || isBusy || isGameDisabled}
              onChange={(event) => setBet(Number(event.target.value) || 1)}
            />
          </div>

          <div className="crash-zone-group">
            <label htmlFor="crash-auto-target">Auto Cashout</label>
            <input
              id="crash-auto-target"
              type="number"
              min="1.01"
              step="0.01"
              value={autoCashoutAt}
              disabled={!autoCashoutEnabled || phase === 'running'}
              onChange={(event) => setAutoCashoutAt(Math.max(1.01, Number(event.target.value) || 1.01))}
            />
            <label className="crash-zone-check">
              <input
                type="checkbox"
                checked={autoCashoutEnabled}
                disabled={phase === 'running'}
                onChange={(event) => setAutoCashoutEnabled(event.target.checked)}
              />
              Enable Auto Cashout
            </label>
          </div>

          <div className="crash-zone-stats">
            <p>
              <span>Balance</span>
              <strong>{formatMoney(userBalance)}</strong>
            </p>
            <p>
              <span>Round Bet</span>
              <strong>{formatMoney(myBet?.betAmount || 0)}</strong>
            </p>
            <p>
              <span>Potential Profit</span>
              <strong>{formatMoney(potentialProfit)}</strong>
            </p>
            <p>
              <span>Last Payout</span>
              <strong>{formatMoney(lastPayout)}</strong>
            </p>
            <p>
              <span>Session P/L</span>
              <strong>{formatMoney(sessionProfit)}</strong>
            </p>
            <p>
              <span>Risk</span>
              <strong>{riskLabel}</strong>
            </p>
          </div>

          <div className="wallet-actions crash-zone-actions">
            <Button className={`crash-main-action ${actionClass}`} onClick={onMainAction} disabled={isGameDisabled || isBusy}>
              {mainActionLabel}
            </Button>
          </div>

          <section className="crash-live-bets">
            <div className="crash-session-history-head">
              <h3>Live Bets</h3>
              <span>{liveBets.length}</span>
            </div>
            <div className="crash-live-bets-list">
              {liveBets.slice(0, 14).map((row) => (
                <article key={row.id} className={`crash-live-row is-${row.status}`}>
                  <strong>{row.username}</strong>
                  <span>{formatMoney(row.betAmount)}</span>
                  <em>{row.cashoutAt ? `${row.cashoutAt.toFixed(2)}x` : '--'}</em>
                </article>
              ))}
            </div>
          </section>

          <section className="crash-session-history">
            <div className="crash-session-history-head">
              <h3>Session Bets</h3>
              <span>{sessionBetHistory.length}/20</span>
            </div>
            <div className="crash-session-history-list">
              {sessionBetHistory.length === 0 ? (
                <p className="crash-session-empty">No bets yet this session.</p>
              ) : (
                sessionBetHistory.map((row, index) => (
                  <article key={`${row.roundId}-${index}`} className={`crash-session-row is-${row.status}`}>
                    <p>
                      <span>Round</span>
                      <strong>{row.roundId}</strong>
                    </p>
                    <p>
                      <span>Bet</span>
                      <strong>{formatMoney(row.betAmount)}</strong>
                    </p>
                    <p>
                      <span>Result</span>
                      <strong className="crash-session-status">{row.status}</strong>
                    </p>
                    <p>
                      <span>Mult</span>
                      <strong>
                        {row.cashoutMultiplier
                          ? `${row.cashoutMultiplier.toFixed(2)}x`
                          : row.crashMultiplier
                            ? `${row.crashMultiplier.toFixed(2)}x`
                            : '--'}
                      </strong>
                    </p>
                    <p>
                      <span>Payout</span>
                      <strong>{formatMoney(row.payout)}</strong>
                    </p>
                    <p>
                      <span>P/L</span>
                      <strong>{formatMoney(row.profit)}</strong>
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </Card>
  );
}

function GamePlay() {
  const { gameSlug } = useParams();
  const { user, token, refreshUser, applyBalanceDelta, syncUser } = useAuth();
  const { games, isSiteOnline } = useAdmin();

  const gameTitle = useMemo(() => {
    if (!gameSlug) return 'Game';
    return gameSlug
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }, [gameSlug]);

  const selectedGame = games.find((game) => game.slug === gameSlug);
  const isGameDisabled = !isSiteOnline || (selectedGame ? !selectedGame.enabled : false);
  const showBlackjack = isBlackjackGame(gameSlug);
  const showMines = isMinesGame(gameSlug);
  const showSlot = isSlotSlug(gameSlug);
  const showCrash = isCrashGame(gameSlug);
  const showDice = isDiceGame(gameSlug);
  const showRoulette = isRouletteGame(gameSlug);
  const showLimbo = isLimboGame(gameSlug);
  const showPlinko = isPlinkoGame(gameSlug);
  const showTowers = isTowersGame(gameSlug);
  const selectedSlot = showSlot ? slotGameBySlug[gameSlug] : null;
  const liveBalance = Number(user.balance || 0);

  return (
    <section className="page-section">
      <header className="page-header">
        <h1>{gameTitle}</h1>
        <p>
          {isGameDisabled
            ? 'This game is currently unavailable by operator control.'
            : `Live game route is active. You are playing as ${user.username}.`}
        </p>
      </header>

      {showBlackjack ? (
        <BlackjackTable
          isGameDisabled={isGameDisabled}
          userBalance={liveBalance}
          applyBalanceDelta={applyBalanceDelta}
        />
      ) : showMines ? (
        <BlackVaultMines
          isGameDisabled={isGameDisabled}
          userBalance={liveBalance}
          applyBalanceDelta={applyBalanceDelta}
          token={token}
        />
      ) : showDice ? (
        <DiceRush
          isGameDisabled={isGameDisabled}
          userBalance={liveBalance}
          token={token}
          refreshUser={refreshUser}
          syncUser={syncUser}
        />
      ) : showRoulette ? (
        <RoulettePro
          isGameDisabled={isGameDisabled}
          userBalance={liveBalance}
          token={token}
          refreshUser={refreshUser}
          syncUser={syncUser}
        />
      ) : showLimbo ? (
        <LimboVault isGameDisabled={isGameDisabled} userBalance={liveBalance} token={token} syncUser={syncUser} />
      ) : showPlinko ? (
        <PlinkoDrop isGameDisabled={isGameDisabled} userBalance={liveBalance} token={token} syncUser={syncUser} />
      ) : showTowers ? (
        <TowersX isGameDisabled={isGameDisabled} userBalance={liveBalance} token={token} syncUser={syncUser} />
      ) : showSlot ? (
        <SlotGamePage slot={selectedSlot} isGameDisabled={isGameDisabled} />
      ) : showCrash ? (
        <OrbitCrash
          isGameDisabled={isGameDisabled}
          userBalance={liveBalance}
          token={token}
          refreshUser={refreshUser}
          syncUser={syncUser}
        />
      ) : (
        <Card className="game-play-card">
          <div className="media-placeholder">Live Game View</div>
          <div className="wallet-actions">
            <Button disabled={isGameDisabled}>Place Bet</Button>
            <Button variant="outline" disabled={isGameDisabled}>
              Auto Play
            </Button>
            <Button as="link" to="/wallet" variant="outline">
              Open Wallet
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}

export default GamePlay;
