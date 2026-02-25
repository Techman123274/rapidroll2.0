import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import GlobalChat from './GlobalChat';

function MobileDock() {
  const [showChat, setShowChat] = useState(false);

  return (
    <>
      <nav className="mobile-dock" aria-label="Mobile navigation">
        <NavLink to="/" className="mobile-dock-link">
          Home
        </NavLink>
        <NavLink to="/originals" className="mobile-dock-link">
          Originals
        </NavLink>
        <NavLink to="/slots" className="mobile-dock-link">
          Slots
        </NavLink>
        <NavLink to="/table-games" className="mobile-dock-link">
          Table
        </NavLink>
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
