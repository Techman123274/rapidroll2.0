import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import GlobalChat from './GlobalChat';

function Sidebar() {
  const { user, isDailyAvailable } = useAuth();

  return (
    <aside className="sidebar" aria-label="Sidebar navigation">
      {/* SIDEBAR TITLE */}
      <h2 className="sidebar-title">Browse</h2>

      {/* SIDEBAR NAV */}
      <nav className="sidebar-nav">
        <NavLink to="/" className="sidebar-link">
          Home
        </NavLink>
        <NavLink to="/games" className="sidebar-link">
          Games
        </NavLink>
        <NavLink to="/promotions" className="sidebar-link">
          Promotions
        </NavLink>
        <NavLink to="/daily" className="sidebar-link">
          Daily Bonus {isDailyAvailable ? '•' : ''}
        </NavLink>
        {(user?.role === 'admin' || user?.role === 'owner') && (
          <NavLink to="/admin" className="sidebar-link">
            Admin Area
          </NavLink>
        )}
      </nav>

      {/* SIDEBAR ACCOUNT PANEL */}
      {user && (
        <section className="sidebar-panel">
          <h3>Session</h3>
          <p className="sidebar-amount">${Number(user.balance).toFixed(2)} USD</p>
          <p className="sidebar-subtle">Tier: {user.vipTier}</p>
          <div className="sidebar-actions">
            <NavLink to="/games" className="sidebar-mini-link">
              Play Now
            </NavLink>
            <NavLink to="/daily" className="sidebar-mini-link">
              {isDailyAvailable ? 'Claim Daily' : 'Daily Done'}
            </NavLink>
          </div>
        </section>
      )}

      {/* SIDEBAR LIVE FEED */}
      <section className="sidebar-panel">
        <h3>Hot Now</h3>
        <ul className="sidebar-feed">
          <li>
            <span>Crash Zone</span>
            <span className="feed-dot" />
          </li>
          <li>
            <span>Roulette Pro</span>
            <span className="feed-dot" />
          </li>
          <li>
            <span>Dice Rush</span>
            <span className="feed-dot" />
          </li>
        </ul>
        <NavLink to="/games" className="sidebar-mini-link sidebar-mini-link-wide">
          Open Game Lobby
        </NavLink>
      </section>

      {/* SIDEBAR CHAT */}
      <GlobalChat />
    </aside>
  );
}

export default Sidebar;
