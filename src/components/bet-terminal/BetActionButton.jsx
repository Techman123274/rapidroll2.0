import Button from '../ui/Button';

function BetActionButton({ label, onClick, disabled, variant = 'primary', className = '' }) {
  return (
    <Button className={`bt-action-btn ${className}`.trim()} variant={variant} onClick={onClick} disabled={disabled}>
      {label}
    </Button>
  );
}

export default BetActionButton;
