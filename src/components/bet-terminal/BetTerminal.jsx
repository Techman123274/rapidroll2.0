import BetAmountInput from './BetAmountInput';
import QuickBetControls from './QuickBetControls';
import BetActionButton from './BetActionButton';
import SessionStatsPanel from './SessionStatsPanel';
import AutoBetPanel from './AutoBetPanel';
import RiskBadge from './RiskBadge';
import { applyQuickAction, deriveRiskFromRatio, getQuickControls } from './betTerminalUtils';

function BetTerminal({
  adapter,
  betAmount,
  balance,
  minBet = 0.01,
  maxBet = 1_000_000,
  onBetAmountChange,
  state,
  action,
  secondaryActions = [],
  stats,
  customFields,
  autoBet,
  error,
  disabled
}) {
  const controls = getQuickControls(adapter?.quickControls);
  const risk =
    typeof adapter?.calculateRisk === 'function'
      ? adapter.calculateRisk({ betAmount, balance, stats, autoBet, state })
      : deriveRiskFromRatio(balance > 0 ? betAmount / balance : 1);

  const payoutPreview =
    typeof adapter?.getPayoutPreview === 'function'
      ? adapter.getPayoutPreview({ betAmount, balance, stats, autoBet, state })
      : null;

  return (
    <section className="bet-terminal-root">
      <div className="bt-top-row">
        <h3>{adapter?.gameName || 'Bet Terminal'}</h3>
        <RiskBadge risk={risk} />
      </div>

      <BetAmountInput value={betAmount} minBet={minBet} maxBet={maxBet} disabled={disabled} onChange={onBetAmountChange} />

      <QuickBetControls
        controls={controls}
        disabled={disabled}
        onApply={(value) => onBetAmountChange(applyQuickAction(betAmount, value, { minBet, maxBet, balance }))}
      />

      {typeof customFields === 'function' && <div className="bt-custom-fields">{customFields()}</div>}

      {payoutPreview && (
        <div className="bt-preview">
          <p>
            <span>Payout</span>
            <strong>${Number(payoutPreview.payout || 0).toFixed(2)}</strong>
          </p>
          <p>
            <span>Profit</span>
            <strong>${Number(payoutPreview.profit || 0).toFixed(2)}</strong>
          </p>
        </div>
      )}

      {error ? <p className="bt-error">{error}</p> : null}

      <div className="bt-actions">
        <BetActionButton label={action.label} onClick={action.onClick} disabled={disabled || action.disabled} className={action.className} />
        {secondaryActions.map((item) => (
          <BetActionButton
            key={item.label}
            label={item.label}
            onClick={item.onClick}
            disabled={disabled || item.disabled}
            variant="outline"
          />
        ))}
      </div>

      <SessionStatsPanel stats={stats} />

      {adapter?.supportsAutoBet && autoBet ? (
        <AutoBetPanel
          enabled={autoBet.enabled}
          config={autoBet.config}
          disabled={disabled}
          onToggle={autoBet.onToggle}
          onChange={autoBet.onChange}
        />
      ) : null}
    </section>
  );
}

export default BetTerminal;
