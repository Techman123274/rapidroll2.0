import { useEffect, useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useSound } from '../../context/SoundContext';
import { api } from '../../services/api';

const rankLabel = {
  ROYAL_FLUSH: 'Royal Flush',
  STRAIGHT_FLUSH: 'Straight Flush',
  FOUR_OF_A_KIND: 'Four of a Kind',
  FULL_HOUSE: 'Full House',
  FLUSH: 'Flush',
  STRAIGHT: 'Straight',
  THREE_OF_A_KIND: 'Three of a Kind',
  TWO_PAIR: 'Two Pair',
  JACKS_OR_BETTER: 'Jacks or Better',
  HIGH_CARD: 'No Win'
};

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

const suitSymbol = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣'
};

const suitClass = {
  S: 'card-black',
  C: 'card-black',
  H: 'card-red',
  D: 'card-red'
};

function PokerCard({ card, held, onHold, disabled }) {
  if (!card) {
    return <div className="poker-card poker-card-empty">--</div>;
  }
  const rank = card.slice(0, 1);
  const suit = card.slice(1, 2);

  return (
    <button
      type="button"
      className={`poker-card ${suitClass[suit] || 'card-black'} ${held ? 'is-held' : ''}`}
      onClick={onHold}
      disabled={disabled}
    >
      <span className="poker-card-rank">{rank === 'T' ? '10' : rank}</span>
      <span className="poker-card-suit">{suitSymbol[suit] || suit}</span>
      <span className="poker-card-hold">{held ? 'HELD' : 'HOLD'}</span>
    </button>
  );
}

function PokerArena({ isGameDisabled, token, userBalance, syncUser }) {
  const { play, unlockAudio } = useSound();
  const [bet, setBet] = useState(10);
  const [handId, setHandId] = useState(null);
  const [status, setStatus] = useState('Press Deal to start Video Poker.');
  const [isBusy, setIsBusy] = useState(false);
  const [cards, setCards] = useState([]);
  const [holds, setHolds] = useState([false, false, false, false, false]);
  const [sessionProfit, setSessionProfit] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [paytable, setPaytable] = useState({});

  const inDrawPhase = Boolean(handId);

  const canDeal = !inDrawPhase && !isBusy && !isGameDisabled;
  const canDraw = inDrawPhase && !isBusy && !isGameDisabled;

  const loadHistory = async () => {
    if (!token) return;
    try {
      const data = await api.getPokerHistory(token);
      setHistory(data.history || []);
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [token]);

  const toggleHold = (index) => {
    if (!inDrawPhase || isBusy) return;
    play({ key: 'poker_hold', src: '/sounds/chip_bet.wav', volume: 0.3, cooldownMs: 30 });
    setHolds((prev) => prev.map((value, idx) => (idx === index ? !value : value)));
  };

  const deal = async () => {
    if (!canDeal) return;
    if (bet <= 0 || bet > userBalance) {
      setStatus('Invalid bet or insufficient balance.');
      return;
    }

    setIsBusy(true);
    unlockAudio();
    play({ key: 'poker_shuffle', src: '/sounds/card_shuffle.wav', volume: 0.4, cooldownMs: 180 });

    try {
      const data = await api.pokerDeal(token, { betAmount: Number(bet) });
      setHandId(data.handId);
      setCards(data.hand || []);
      setHolds([false, false, false, false, false]);
      setPaytable(data.paytable || {});
      setStatus('Select cards to hold, then Draw.');
      syncUser?.(data.user);
      setSessionProfit((prev) => Number((prev - Number(bet)).toFixed(2)));
      setLastResult(null);
      play({ key: 'poker_deal', src: '/sounds/card_deal.wav', volume: 0.45, cooldownMs: 40 });
    } catch (error) {
      setStatus(error.message || 'Deal failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const draw = async () => {
    if (!canDraw || !handId) return;

    setIsBusy(true);
    play({ key: 'poker_draw', src: '/sounds/card_deal.wav', volume: 0.45, cooldownMs: 40 });

    try {
      const data = await api.pokerDraw(token, { handId, holds });
      setCards(data.finalHand || []);
      setHandId(null);
      setLastResult(data);
      setStatus(`${rankLabel[data.handRank] || data.handRank} • Payout ${formatMoney(data.payout)}.`);
      syncUser?.(data.user);
      setSessionProfit((prev) => Number((prev + Number(data.payout || 0)).toFixed(2)));
      if (Number(data.payout || 0) > 0) {
        play({ key: 'poker_win', src: '/sounds/big_win.wav', volume: 0.55, cooldownMs: 120 });
      } else {
        play({ key: 'poker_lose', src: '/sounds/mine_thud.wav', volume: 0.35, cooldownMs: 120 });
      }
      await loadHistory();
    } catch (error) {
      setStatus(error.message || 'Draw failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const topHistory = useMemo(() => history.slice(0, 10), [history]);

  return (
    <Card className="game-play-card poker-root">
      <header className="page-header">
        <h2>Poker Arena (Video Poker)</h2>
        <p>{status}</p>
      </header>

      <section className="poker-topbar">
        <label>
          Bet
          <input
            type="number"
            min="1"
            step="1"
            value={bet}
            disabled={inDrawPhase || isBusy}
            onChange={(event) => setBet(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
        <div className="poker-quick-bets">
          {[1, 5, 10, 25].map((delta) => (
            <button key={delta} type="button" className="btn btn-outline" disabled={inDrawPhase || isBusy} onClick={() => setBet((prev) => Math.max(1, Number((prev + delta).toFixed(2))))}>
              +{delta}
            </button>
          ))}
          <button type="button" className="btn btn-outline" disabled={inDrawPhase || isBusy} onClick={() => setBet((prev) => Math.max(1, Number((prev / 2).toFixed(2))))}>
            /2
          </button>
          <button type="button" className="btn btn-outline" disabled={inDrawPhase || isBusy} onClick={() => setBet((prev) => Number((prev * 2).toFixed(2)))}>
            x2
          </button>
        </div>
        <div className="poker-balance-chip">Balance: {formatMoney(userBalance)}</div>
      </section>

      <section className="poker-hand-grid" aria-label="Poker hand">
        {Array.from({ length: 5 }).map((_, index) => (
          <PokerCard
            key={`card-${index}`}
            card={cards[index]}
            held={holds[index]}
            onHold={() => toggleHold(index)}
            disabled={!inDrawPhase || isBusy}
          />
        ))}
      </section>

      <div className="wallet-actions poker-actions">
        <Button onClick={() => void deal()} disabled={!canDeal}>
          Deal
        </Button>
        <Button variant="outline" onClick={() => void draw()} disabled={!canDraw}>
          Draw
        </Button>
      </div>

      <section className="poker-summary-grid">
        <Card>
          <h3>Session P/L</h3>
          <p className="wallet-value">{formatMoney(sessionProfit)}</p>
        </Card>
        <Card>
          <h3>Last Rank</h3>
          <p className="wallet-value">{lastResult ? rankLabel[lastResult.handRank] || lastResult.handRank : '--'}</p>
        </Card>
        <Card>
          <h3>Last Payout</h3>
          <p className="wallet-value">{formatMoney(lastResult?.payout || 0)}</p>
        </Card>
      </section>

      <section className="poker-lower-grid">
        <Card className="poker-paytable-card">
          <h3>Paytable (x Bet)</h3>
          <ul className="poker-paytable-list">
            {Object.entries(paytable).map(([rank, multiplier]) => (
              <li key={rank}>
                <span>{rankLabel[rank] || rank}</span>
                <strong>{multiplier}x</strong>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="poker-history-card">
          <h3>Recent Hands</h3>
          <div className="poker-history-list">
            {topHistory.length === 0 ? (
              <p className="challenge-loading">No hands yet.</p>
            ) : (
              topHistory.map((entry) => (
                <article key={entry.id} className={`poker-history-row ${entry.profit >= 0 ? 'is-win' : 'is-loss'}`}>
                  <span>{rankLabel[entry.handRank] || entry.handRank || 'In Progress'}</span>
                  <strong>{formatMoney(entry.payout)}</strong>
                  <em>{new Date(entry.createdAt).toLocaleTimeString()}</em>
                </article>
              ))
            )}
          </div>
        </Card>
      </section>
    </Card>
  );
}

export default PokerArena;
