import { useEffect, useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import FairnessPanel from '../../components/fairness/FairnessPanel';
import BetTerminal from '../../components/bet-terminal/BetTerminal';
import towersAdapter from '../adapters/stubs/towersAdapter';
import { api } from '../../services/api';

const FLOORS = 8;
const COLUMNS = 3;

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;
const getNextMultiplier = (safeReveals) => Number((0.99 / Math.pow(2 / 3, Math.max(0, safeReveals))).toFixed(4));

function TowersX({ isGameDisabled, userBalance, token, syncUser }) {
  const [bet, setBet] = useState(10);
  const [activeGame, setActiveGame] = useState(null);
  const [status, setStatus] = useState('Start a Towers game and climb to higher multipliers.');
  const [isBusy, setIsBusy] = useState(false);
  const [sessionProfit, setSessionProfit] = useState(0);
  const [totalWagered, setTotalWagered] = useState(0);
  const [betsCount, setBetsCount] = useState(0);
  const [lastPayout, setLastPayout] = useState(0);
  const [revealedRows, setRevealedRows] = useState([]);
  const [fairnessState, setFairnessState] = useState({
    clientSeed: 'towers-client-seed',
    nonce: 0,
    hashedServerSeed: ''
  });

  const revealedByFloor = useMemo(() => {
    const map = new Map();
    revealedRows.forEach((entry) => map.set(entry.floor, entry));
    return map;
  }, [revealedRows]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const loadActive = async () => {
      try {
        const data = await api.getActiveTowers(token);
        if (cancelled || !data?.game) return;
        setActiveGame({
          id: data.game.id,
          betAmount: Number(data.game.betAmount || 0),
          currentFloor: Number(data.game.currentFloor || 0),
          multiplier: Number(data.game.multiplier || 1)
        });
        setFairnessState((prev) => ({
          ...prev,
          nonce: Number(data.game.nonce || prev.nonce || 0),
          hashedServerSeed: data.game.hashedServerSeed || prev.hashedServerSeed,
          clientSeed: data.game.clientSeed || prev.clientSeed
        }));
        setStatus('Resumed active Towers game.');
      } catch {
        if (!cancelled) {
          setActiveGame(null);
        }
      }
    };

    void loadActive();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onStartGame = async () => {
    if (isBusy || isGameDisabled || !token || activeGame) return;
    if (bet <= 0 || bet > userBalance) {
      setStatus('Invalid bet or insufficient balance.');
      return;
    }

    setIsBusy(true);
    try {
      const data = await api.startTowers(token, {
        betAmount: Number(bet),
        clientSeed: fairnessState.clientSeed
      });
      setActiveGame({
        id: data.gameId,
        betAmount: Number(bet),
        currentFloor: Number(data.currentFloor || 0),
        multiplier: Number(data.multiplier || 1)
      });
      setRevealedRows([]);
      setStatus('Game started. Pick a column to reveal the next floor.');
      setTotalWagered((prev) => Number((prev + Number(bet)).toFixed(2)));
      setBetsCount((prev) => prev + 1);
      setFairnessState((prev) => ({
        ...prev,
        nonce: Number(data.nonce || 0),
        hashedServerSeed: data.hashedServerSeed || '',
        clientSeed: data.clientSeed || prev.clientSeed
      }));
      syncUser?.(data.user);
    } catch (error) {
      setStatus(error.message || 'Unable to start Towers.');
    } finally {
      setIsBusy(false);
    }
  };

  const onReveal = async (column) => {
    if (isBusy || isGameDisabled || !token || !activeGame) return;
    if (!Number.isInteger(column) || column < 0 || column >= COLUMNS) return;

    const floorBefore = Number(activeGame.currentFloor || 0);

    setIsBusy(true);
    try {
      const data = await api.revealTowers(token, {
        gameId: activeGame.id,
        column
      });

      setRevealedRows((prev) => [
        ...prev,
        {
          floor: floorBefore,
          pickColumn: column,
          mineColumn: data.mineColumn,
          status: data.hitMine ? 'mine' : 'safe'
        }
      ]);

      if (data.user) syncUser?.(data.user);

      if (data.status === 'active') {
        setActiveGame((prev) =>
          prev
            ? {
                ...prev,
                currentFloor: Number(data.currentFloor || 0),
                multiplier: Number(data.multiplier || prev.multiplier)
              }
            : prev
        );
        setStatus(`Safe reveal. Floor ${Number(data.currentFloor || 0)} unlocked.`);
      } else {
        const payout = Number(data.payout || 0);
        const stake = Number(activeGame.betAmount || 0);
        const profit = Number((payout - stake).toFixed(2));
        setSessionProfit((prev) => Number((prev + profit).toFixed(2)));
        setLastPayout(payout);
        setActiveGame(null);
        if (data.status === 'won') {
          setStatus(`All floors cleared. Payout ${formatMoney(payout)}.`);
        } else {
          setStatus(`Mine hit on floor ${floorBefore + 1}. Round lost.`);
        }
      }
    } catch (error) {
      setStatus(error.message || 'Reveal failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const onCashout = async () => {
    if (isBusy || isGameDisabled || !token || !activeGame) return;

    setIsBusy(true);
    try {
      const data = await api.cashoutTowers(token, {
        gameId: activeGame.id
      });
      const payout = Number(data.payout || 0);
      const stake = Number(activeGame.betAmount || 0);
      const profit = Number((payout - stake).toFixed(2));

      syncUser?.(data.user);
      setSessionProfit((prev) => Number((prev + profit).toFixed(2)));
      setLastPayout(payout);
      setActiveGame(null);
      setStatus(`Cashed out at ${Number(data.multiplier || 1).toFixed(2)}x for ${formatMoney(payout)}.`);
    } catch (error) {
      setStatus(error.message || 'Cashout failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const activeBet = Number(activeGame?.betAmount || bet);
  const nextMultiplier = getNextMultiplier(Number(activeGame?.currentFloor || 0) + 1);
  const selectedRiskState = {
    currentFloor: Number(activeGame?.currentFloor || 0),
    multiplier: Number(activeGame?.multiplier || 1)
  };

  return (
    <Card className="game-play-card">
      <header className="page-header">
        <h2>Towers X</h2>
        <p>{status}</p>
      </header>

      <section className="towers-layout">
        <section className="towers-board-card">
          <div className="towers-board-head">
            <h3>Tower Grid</h3>
            <p>{activeGame ? `Floor ${Number(activeGame.currentFloor || 0) + 1} of ${FLOORS}` : 'No active round'}</p>
          </div>

          <div className="towers-board">
            {Array.from({ length: FLOORS }, (_, idx) => FLOORS - idx - 1).map((floor) => {
              const isCurrentFloor = activeGame && floor === Number(activeGame.currentFloor || 0);
              const entry = revealedByFloor.get(floor);

              return (
                <div key={floor} className={`towers-row ${isCurrentFloor ? 'is-current' : ''}`}>
                  <span className="towers-floor-label">F{floor + 1}</span>
                  <div className="towers-row-cells">
                    {Array.from({ length: COLUMNS }, (_unused, col) => {
                      const isSafeReveal = entry?.status === 'safe' && entry?.pickColumn === col;
                      const isMineReveal = entry?.status === 'mine' && entry?.mineColumn === col;
                      const isDisabled = !isCurrentFloor || isBusy || isGameDisabled || !activeGame;
                      return (
                        <button
                          key={`${floor}-${col}`}
                          type="button"
                          className={`towers-cell ${isSafeReveal ? 'is-safe' : ''} ${isMineReveal ? 'is-mine' : ''}`}
                          disabled={isDisabled}
                          onClick={() => void onReveal(col)}
                        >
                          {isSafeReveal ? 'SAFE' : isMineReveal ? 'MINE' : col + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="towers-summary-grid">
            <article>
              <span>Current Multiplier</span>
              <strong>{Number(activeGame?.multiplier || 1).toFixed(4)}x</strong>
            </article>
            <article>
              <span>Next Multiplier</span>
              <strong>{nextMultiplier.toFixed(4)}x</strong>
            </article>
            <article>
              <span>Potential Cashout</span>
              <strong>{formatMoney(activeBet * Number(activeGame?.multiplier || 1))}</strong>
            </article>
          </div>
        </section>

        <section className="towers-side-card">
          <BetTerminal
            adapter={towersAdapter}
            betAmount={bet}
            balance={userBalance}
            state={selectedRiskState}
            minBet={0.01}
            maxBet={1_000_000}
            disabled={isBusy || isGameDisabled}
            onBetAmountChange={setBet}
            action={
              activeGame
                ? {
                    label: 'Tap Grid To Reveal',
                    onClick: () => {},
                    disabled: true
                  }
                : {
                    label: isBusy ? 'Starting...' : 'Start Towers',
                    onClick: () => void onStartGame(),
                    disabled: isBusy || isGameDisabled
                  }
            }
            secondaryActions={
              activeGame
                ? [
                    {
                      label: 'Cash Out',
                      onClick: () => void onCashout(),
                      disabled: Number(activeGame.currentFloor || 0) <= 0 || isBusy || isGameDisabled
                    }
                  ]
                : []
            }
            customFields={() => (
              <>
                <label className="bt-field">
                  Client Seed
                  <input
                    type="text"
                    maxLength={80}
                    value={fairnessState.clientSeed}
                    disabled={Boolean(activeGame) || isBusy}
                    onChange={(event) => setFairnessState((prev) => ({ ...prev, clientSeed: event.target.value }))}
                  />
                </label>
              </>
            )}
            stats={{
              sessionPL: sessionProfit,
              totalWagered,
              lastPayout,
              betsCount
            }}
          />

          <FairnessPanel
            token={token}
            game="towers"
            fairnessState={fairnessState}
            onClientSeedChange={(value) => setFairnessState((prev) => ({ ...prev, clientSeed: value }))}
            onRotateSeed={async () => {
              const data = await api.rotateFairnessSeed(token, 'towers', fairnessState.clientSeed);
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

export default TowersX;
