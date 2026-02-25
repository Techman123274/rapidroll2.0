import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';

function NotificationCenter() {
  const { notifications, unreadCount, dismissOne, dismissAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const handleDocClick = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  return (
    <div className="notification-center" ref={rootRef}>
      <button
        type="button"
        className="notification-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && <span className="notification-count">{Math.min(unreadCount, 99)}</span>}
      </button>

      {open && (
        <section className="notification-dropdown" role="menu" aria-label="Notifications">
          <header>
            <h4>Notifications</h4>
            {notifications.length > 0 && (
              <button type="button" onClick={dismissAll}>
                Mark all read
              </button>
            )}
          </header>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <p className="notification-empty">No unread notifications.</p>
            ) : (
              notifications.map((item) => (
                <article key={item.id} className={`notification-item notification-${item.type}`}>
                  <NavLink to={item.path} onClick={() => setOpen(false)}>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                  </NavLink>
                  <button type="button" onClick={() => dismissOne(item.id)}>
                    Dismiss
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default NotificationCenter;
