import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAdmin } from '../../context/AdminContext';

function GlobalChat() {
  const { user } = useAuth();
  const { globalMessages, sendGlobalMessage } = useAdmin();
  const [draft, setDraft] = useState('');

  const onSubmit = (event) => {
    event.preventDefault();
    sendGlobalMessage(user?.username ?? 'Guest', draft);
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
          placeholder="Type a message..."
          maxLength={180}
        />
        <button type="submit">Send</button>
      </form>
    </section>
  );
}

export default GlobalChat;
