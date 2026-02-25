import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function Footer() {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'owner';

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        {/* LEGAL LINKS */}
        <nav aria-label="Footer links" className="footer-links">
          {user && <Link to="/wallet">Wallet</Link>}
          {user && <Link to="/settings">Settings</Link>}
          {isStaff && <Link to="/admin">Admin Panel</Link>}
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/faq">FAQ</Link>
          <Link to="/responsible-gambling">Responsible Gambling</Link>
        </nav>

        {/* SOCIAL LINKS */}
        <nav aria-label="Social links" className="social-links">
          <a href="https://x.com" target="_blank" rel="noreferrer" aria-label="X">
            [X]
          </a>
          <a href="https://discord.com" target="_blank" rel="noreferrer" aria-label="Discord">
            [Discord]
          </a>
          <a href="https://telegram.org" target="_blank" rel="noreferrer" aria-label="Telegram">
            [Telegram]
          </a>
          <a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram">
            [Instagram]
          </a>
        </nav>

        {/* COPYRIGHT */}
        <p className="copyright">© 2026 Rapid Rolls 2.0. All rights reserved.</p>
      </div>
    </footer>
  );
}

export default Footer;
