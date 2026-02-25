import { useMemo, useState } from 'react';
import { useAdmin } from '../context/AdminContext';

const DISMISSED_KEY = 'rapidroll_dismissed_notifications';

function loadDismissed() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((item) => String(item)));
  } catch {
    return new Set();
  }
}

export function useNotifications() {
  const { globalMessages, promotions } = useAdmin();
  const [dismissed, setDismissed] = useState(loadDismissed);

  const notifications = useMemo(() => {
    const promoItems = (promotions || []).slice(0, 5).map((promo) => ({
      id: `promo-${promo._id || promo.id}`,
      title: promo.title || promo.name || 'Promotion',
      text: promo.description || 'New promotion is available.',
      type: 'promotion',
      path: promo.path || '/promotions',
      createdAt: promo.createdAt || new Date().toISOString()
    }));

    const messageItems = (globalMessages || [])
      .filter((message) => message.user === 'DealerBot')
      .slice(-8)
      .map((message) => ({
        id: `msg-${message._id || message.id}`,
        title: 'Site Notification',
        text: message.text,
        type: 'announcement',
        path: '/promotions',
        createdAt: message.createdAt || new Date().toISOString()
      }));

    return [...messageItems, ...promoItems]
      .filter((item) => !dismissed.has(item.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [globalMessages, promotions, dismissed]);

  const unreadCount = notifications.length;

  const dismissOne = (id) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(String(id));
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const dismissAll = () => {
    setDismissed((prev) => {
      const next = new Set(prev);
      notifications.forEach((item) => next.add(item.id));
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  return {
    notifications,
    unreadCount,
    dismissOne,
    dismissAll
  };
}
