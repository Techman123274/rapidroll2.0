import { Link } from 'react-router-dom';

function Button({ as = 'button', to, variant = 'primary', className = '', children, ...props }) {
  const classes = `btn btn-${variant} ${className}`.trim();

  if (as === 'link') {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}

export default Button;
