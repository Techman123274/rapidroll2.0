import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import GlobalChat from './GlobalChat';

function MobileDock() {
  const { user } = useAuth();
  const [showChat, setShowChat] = useState(false);

  return (
    <>
      <nav className="mobile-dock" aria-label="Mobile navigation">
        <NavLink to="/" className="mobile-dock-link">
          Home
        </NavLink>
        <NavLink to="/games" className="mobile-dock-link">
          Games
        </NavLink>
        {user ? (
          <NavLink to="/wallet" className="mobile-dock-link">
            Wallet
          </NavLink>
        ) : (
          <NavLink to="/login" className="mobile-dock-link">
            Login
          </NavLink>
        )}
        <button type="button" className="mobile-dock-link mobile-chat-toggle" onClick={() => setShowChat((prev) => !prev)}>
          Chat
        </button>
      </nav>

      {showChat && (
        <section className="mobile-chat-sheet" aria-label="Mobile global chat">
          <header className="mobile-chat-sheet-head">
            <h3>Global Chat</h3>
            <button type="button" onClick={() => setShowChat(false)}>
              Close
            </button>
          </header>
          <GlobalChat />
        </section>
      )}
    </>
  );
}

export default MobileDock;
