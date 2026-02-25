import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../services/api';

const AdminContext = createContext(null);

export function AdminProvider({ children }) {
  const { user, token } = useAuth();

  const [users, setUsers] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [globalMessages, setGlobalMessages] = useState([]);
  const [adminMessages, setAdminMessages] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [games, setGames] = useState([]);
  const [isSiteOnline, setIsSiteOnline] = useState(true);

  const refreshLogs = async () => {
    if (!token || (user?.role !== 'admin' && user?.role !== 'owner')) {
      setAuditLogs([]);
      return;
    }
    const logsData = await api.getAdminLogs(token);
    setAuditLogs(logsData.logs || []);
  };

  const refreshState = async () => {
    const data = token ? await api.getPlatformState(token) : await api.getPublicState();

    setPromotions(data.promotions || []);
    setGlobalMessages(data.globalMessages || []);
    setGames(data.games || []);
    setIsSiteOnline(Boolean(data.isSiteOnline));
    setUsers(data.users || []);
    setAdminMessages(data.adminMessages || []);
    await refreshLogs();
  };

  useEffect(() => {
    refreshState().catch(() => {
      setPromotions([]);
      setGlobalMessages([]);
      setGames([]);
      setUsers([]);
      setAdminMessages([]);
      setAuditLogs([]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id]);

  const sendGlobalMessage = async (username, text) => {
    const value = String(text || '').trim();
    if (!value) return;
    const message = await api.sendGlobalMessage(token, username, value);
    setGlobalMessages((prev) => [...prev, message]);
  };

  const deleteGlobalMessage = async (id) => {
    await api.deleteGlobalMessage(token, id);
    setGlobalMessages((prev) => prev.filter((message) => String(message._id || message.id) !== String(id)));
    await refreshLogs();
  };

  const clearGlobalChat = async () => {
    await api.clearGlobalChat(token);
    setGlobalMessages([]);
    await refreshLogs();
  };

  const postAnnouncement = async (text) => {
    const value = String(text || '').trim();
    if (!value) return;
    const message = await api.postAnnouncement(token, value);
    setGlobalMessages((prev) => [...prev, message]);
    await refreshLogs();
  };

  const addPromotion = async (promo) => {
    const promotion = await api.addPromotion(token, promo);
    setPromotions((prev) => [promotion, ...prev]);
    await refreshLogs();
  };

  const setUserPassword = async (userId, password) => {
    const value = String(password || '').trim();
    if (!value) return;
    await api.setUserPassword(token, userId, value);
    await refreshLogs();
  };

  const addAdmin = async (payload) => {
    await api.addAdmin(token, payload);
    await refreshState();
    await refreshLogs();
  };

  const removeAdmin = async (userId) => {
    await api.removeAdmin(token, userId);
    setUsers((prev) => prev.filter((row) => String(row.id || row._id) !== String(userId)));
    await refreshLogs();
  };

  const toggleSiteOnline = async () => {
    const result = await api.setSiteOnline(token, !isSiteOnline);
    setIsSiteOnline(Boolean(result.isSiteOnline));
    await refreshLogs();
  };

  const toggleGameEnabled = async (slug) => {
    const target = games.find((game) => game.slug === slug);
    if (!target) return;

    const updated = await api.setGameEnabled(token, slug, !target.enabled);
    setGames((prev) =>
      prev.map((game) => (game.slug === slug ? { ...game, enabled: Boolean(updated.enabled) } : game))
    );
    await refreshLogs();
  };

  const sendAdminMessage = async (username, text) => {
    const value = String(text || '').trim();
    if (!value) return;

    const message = await api.sendAdminMessage(token, value);
    setAdminMessages((prev) => [...prev, message]);
    await refreshLogs();
  };

  const value = useMemo(
    () => ({
      users,
      promotions,
      globalMessages,
      adminMessages,
      auditLogs,
      games,
      isSiteOnline,
      refreshState,
      sendGlobalMessage,
      deleteGlobalMessage,
      clearGlobalChat,
      postAnnouncement,
      addPromotion,
      setUserPassword,
      addAdmin,
      removeAdmin,
      toggleSiteOnline,
      toggleGameEnabled,
      sendAdminMessage
    }),
    [users, promotions, globalMessages, adminMessages, auditLogs, games, isSiteOnline]
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within AdminProvider');
  }
  return context;
}
