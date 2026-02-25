import { useMemo, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';

function SiteNotifications() {
  const { globalMessages } = useAdmin();
  const [dismissed, setDismissed] = useState(() => new Set());

  const notifications = useMemo(
    () =>
      (globalMessages || [])
        .filter((message) => message.user === 'DealerBot')
        .slice(-3)
        .reverse()
        .filter((message) => !dismissed.has(String(message._id || message.id))),
    [globalMessages, dismissed]
  );

  if (notifications.length === 0) return null;

  return (
    <section className="site-notifications" aria-label="Site notifications">
      <div className="container site-notifications-inner">
        {notifications.map((message) => (
          <article key={message._id || message.id} className="site-notification-item">
            <p>{message.text}</p>
            <button
              type="button"
              onClick={() =>
                setDismissed((prev) => {
                  const next = new Set(prev);
                  next.add(String(message._id || message.id));
                  return next;
                })
              }
              aria-label="Dismiss notification"
            >
              Dismiss
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export default SiteNotifications;
