import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Button from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useSound } from '../../context/SoundContext';
import NotificationCenter from './NotificationCenter';

function Header() {
  const { user, logout, isLoading, isDailyAvailable } = useAuth();
  const { muted, toggleMute, unlockAudio } = useSound();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    const onDocumentClick = (event) => {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  return (
    <header className="site-header">
      <div className="container header-inner">
        {/* LOGO */}
        <NavLink to="/" className="logo" aria-label="Rapid Rolls home">
          RAPID ROLLS 2.0
        </NavLink>

        {/* PRIMARY NAV */}
        <nav className="main-nav" aria-label="Primary">
          <NavLink to="/tournaments" className="nav-link">
            Tournaments
          </NavLink>
          <NavLink to="/leaderboard" className="nav-link">
            Leaderboard
          </NavLink>
          <NavLink to="/challenges" className="nav-link">
            Challenges
          </NavLink>
          {(user?.role === 'admin' || user?.role === 'owner') && (
            <NavLink to="/admin" className="nav-link">
              Admin
            </NavLink>
          )}
        </nav>

        {/* AUTH ACTIONS */}
        <div className="header-actions">
          <NotificationCenter />
          <button
            type="button"
            className="sound-toggle-btn"
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            onClick={() => {
              unlockAudio();
              toggleMute();
            }}
          >
            {muted ? 'Sound Off' : 'Sound On'}
          </button>
          {user ? (
            <>
              <Button as="link" to="/daily" variant={isDailyAvailable ? 'primary' : 'outline'}>
                {isDailyAvailable ? `Claim +$${user.dailyReward}` : 'Daily Claimed'}
              </Button>
              <div className="profile-menu" ref={profileRef}>
                <button
                  type="button"
                  className="profile-trigger"
                  aria-haspopup="menu"
                  aria-expanded={isProfileOpen}
                  onClick={() => setIsProfileOpen((prev) => !prev)}
                >
                  <span className="profile-avatar" aria-hidden="true">
                    {user.username.slice(0, 1).toUpperCase()}
                  </span>
                </button>
                {isProfileOpen && (
                  <div className="profile-dropdown" role="menu" aria-label="Profile menu">
                    <p className="profile-name">
                      {user.username} {user.role === 'owner' ? '(Owner)' : user.role === 'admin' ? '(Admin)' : ''}
                    </p>
                    <NavLink to="/settings" className="profile-item" onClick={() => setIsProfileOpen(false)}>
                      Settings
                    </NavLink>
                    <NavLink to="/wallet" className="profile-item" onClick={() => setIsProfileOpen(false)}>
                      Wallet
                    </NavLink>
                    <NavLink to="/vip" className="profile-item" onClick={() => setIsProfileOpen(false)}>
                      VIP Lounge
                    </NavLink>
                    {(user.role === 'admin' || user.role === 'owner') && (
                      <NavLink to="/admin" className="profile-item" onClick={() => setIsProfileOpen(false)}>
                        Admin Area
                      </NavLink>
                    )}
                    <button
                      type="button"
                      className="profile-item profile-item-logout"
                      onClick={() => {
                        setIsProfileOpen(false);
                        logout();
                      }}
                      disabled={isLoading}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Button as="link" to="/login" variant="outline">
                Login
              </Button>
              <Button as="link" to="/register">
                Sign Up
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
