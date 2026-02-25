import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAdmin } from '../../context/AdminContext';

const GUEST_ID_KEY = 'rapid_guest_id';
const GUEST_NAME_KEY = 'rapid_guest_name';

const getGuestProfile = () => {
  const existingId = localStorage.getItem(GUEST_ID_KEY);
  const existingName = localStorage.getItem(GUEST_NAME_KEY);

  if (existingId && existingName) {
    return { id: existingId, name: existingName };
  }

  const id = Math.random().toString(36).slice(2, 10);
  const name = `Guest-${id.slice(0, 4).toUpperCase()}`;
  localStorage.setItem(GUEST_ID_KEY, id);
  localStorage.setItem(GUEST_NAME_KEY, name);
  return { id, name };
};

function GlobalChat() {
  const { user } = useAuth();
  const { globalMessages, sendGlobalMessage } = useAdmin();
  const [draft, setDraft] = useState('');
  const guestProfile = !user ? getGuestProfile() : null;

  const onSubmit = (event) => {
    event.preventDefault();
    sendGlobalMessage(user?.username ?? guestProfile?.name ?? 'Guest', draft, guestProfile?.id || null);
    setDraft('');
  };

  return (
    <section className="sidebar-panel chat-sidebar" aria-label="Global chat">
      <div className="chat-head">
        <h3>Global Chat</h3>
        <span>{globalMessages.length} msgs</span>
      </div>

      <ul className="chat-messages">
        {globalMessages.map((message) => (
          <li key={message._id || message.id} className="chat-message">
            <strong>{message.user}</strong>
            <p>{message.text}</p>
          </li>
        ))}
      </ul>

      <form className="chat-form" onSubmit={onSubmit}>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={user ? 'Type a message...' : `Chat as ${guestProfile?.name}`}
          maxLength={180}
        />
        <button type="submit">Send</button>
      </form>
    </section>
  );
}

export default GlobalChat;
