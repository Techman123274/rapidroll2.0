'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/src/lib/api';

type AdminOverview = {
  activeGames: Array<{
    id: string;
    userId: string;
    gridSize: number;
    mineCount: number;
    revealedTiles: number[];
    minesPositions: number[];
    betAmount: number;
    multiplier: number;
    createdAt: string;
  }>;
  recentGames: Array<{
    id: string;
    status: string;
    betAmount: number;
    payout: number;
    mineCount: number;
    gridSize: number;
    createdAt: string;
  }>;
  platformTotals: {
    users: number;
    totalBalance: number;
    totalWagered: number;
    totalWon: number;
  };
};

type Settings = {
  houseEdge: number;
  siteOnline: boolean;
};

type MeResponse = {
  user: {
    id: string;
    username: string;
    role: 'player' | 'admin' | 'owner';
  };
};

type AuditLog = {
  id: string;
  action: string;
  actor: string;
  actorRole: string;
  target: string;
  createdAt: string;
};

export function AdminMinesPanel() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [settings, setSettings] = useState<Settings>({ houseEdge: 0.01, siteOnline: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<Array<{ id: string; username: string; role: string; minesBanned: boolean }>>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [meRole, setMeRole] = useState<'player' | 'admin' | 'owner'>('player');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminRole, setAdminRole] = useState<'player' | 'admin'>('admin');
  const [audit, setAudit] = useState<AuditLog[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [meData, overviewData, settingsData, auditData] = await Promise.all([
        apiRequest<MeResponse>('/api/auth/me'),
        apiRequest<AdminOverview>('/api/admin/mines/overview'),
        apiRequest<Settings>('/api/admin/mines/settings'),
        apiRequest<{ logs: AuditLog[] }>('/api/admin/mines/audit')
      ]);
      setMeRole(meData.user.role);
      setOverview(overviewData);
      setSettings(settingsData);
      setAudit(auditData.logs.slice(0, 12));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiRequest<{ users: Array<{ id: string; username: string; role: string; minesBanned: boolean }> }>(
        `/api/admin/mines/users${search ? `?q=${encodeURIComponent(search)}` : ''}`
      );
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users');
    }
  }, [search]);

  useEffect(() => {
    void loadData();
    void loadUsers();
  }, [loadData, loadUsers]);

  async function saveSettings() {
    setLoading(true);
    setError('');
    setNotice('');

    try {
      await apiRequest('/api/admin/mines/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings)
      });
      setNotice('Settings saved.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update settings');
    } finally {
      setLoading(false);
    }
  }

  async function forceEnd(gameId: string) {
    setLoading(true);
    setError('');

    try {
      await apiRequest(`/api/admin/mines/games/${gameId}/force-end`, { method: 'POST' });
      setNotice(`Game ${gameId} force ended.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to force end game');
    } finally {
      setLoading(false);
    }
  }

  async function updateUser(minesBanned: boolean) {
    if (!targetUserId) return;
    setLoading(true);
    setError('');

    try {
      await apiRequest(`/api/admin/mines/users/${targetUserId}`, {
        method: 'PATCH',
        body: JSON.stringify({ minesBanned, resetPassword: newPassword || undefined })
      });
      setNotice('User updated.');
      setNewPassword('');
      await loadUsers();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update user');
    } finally {
      setLoading(false);
    }
  }

  async function setAdminRole() {
    if (!adminUsername.trim()) return;
    setLoading(true);
    setError('');

    try {
      await apiRequest('/api/admin/mines/admins', {
        method: 'POST',
        body: JSON.stringify({ username: adminUsername.trim(), role: adminRole })
      });
      setNotice('Admin role updated.');
      setAdminUsername('');
      await loadUsers();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update admin role');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <header className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Mines Admin Panel</h1>
            <p className="text-sm text-slate-400">Operations, game supervision, user controls, and audit-safe actions.</p>
          </div>
          <Link href="/games/mines" className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200">
            Back to Game
          </Link>
        </div>
      </header>

      <section className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-900/50 p-4 md:grid-cols-4">
        <label className="md:col-span-2">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">House Edge</span>
          <input
            type="number"
            min={0}
            max={0.1}
            step={0.001}
            value={settings.houseEdge}
            onChange={(e) => setSettings((prev) => ({ ...prev, houseEdge: Number(e.target.value) }))}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 md:col-span-1">
          <input
            type="checkbox"
            checked={settings.siteOnline}
            onChange={(e) => setSettings((prev) => ({ ...prev, siteOnline: e.target.checked }))}
            className="accent-emerald-500"
          />
          <span className="text-sm text-slate-200">Site Online</span>
        </label>
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={loading}
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300"
        >
          Save Settings
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
          <h2 className="mb-3 text-sm uppercase tracking-wide text-slate-500">Active Games</h2>
          <ul className="max-h-[420px] space-y-2 overflow-auto pr-1">
            {(overview?.activeGames || []).map((game) => (
              <li key={game.id} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-xs text-slate-200">
                <p>ID: {game.id}</p>
                <p>
                  Grid {game.gridSize}x{game.gridSize} | Mines {game.mineCount}
                </p>
                <p>Bet: {game.betAmount.toFixed(2)}</p>
                <p>Mines: {game.minesPositions.join(', ')}</p>
                <button
                  type="button"
                  onClick={() => void forceEnd(game.id)}
                  className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-rose-300"
                >
                  Force End
                </button>
              </li>
            ))}
            {(overview?.activeGames || []).length === 0 && <li className="text-sm text-slate-400">No active games.</li>}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
          <h2 className="mb-3 text-sm uppercase tracking-wide text-slate-500">User Management</h2>
          <div className="mb-3 flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username/email"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
            />
            <button type="button" onClick={() => void loadUsers()} className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200">
              Search
            </button>
          </div>

          <select
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            className="mb-2 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
          >
            <option value="">Select user</option>
            {users.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.username} ({entry.role}) {entry.minesBanned ? '[BANNED]' : ''}
              </option>
            ))}
          </select>

          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Optional new password"
            className="mb-2 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void updateUser(false)}
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
            >
              Unban
            </button>
            <button
              type="button"
              onClick={() => void updateUser(true)}
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
            >
              Ban from Mines
            </button>
          </div>
        </div>
      </section>

      {meRole === 'owner' && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h2 className="mb-3 text-sm uppercase tracking-wide text-amber-300">Owner Controls</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              placeholder="Username"
              className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
            />
            <select
              value={adminRole}
              onChange={(e) => setAdminRole(e.target.value as 'player' | 'admin')}
              className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
            >
              <option value="admin">Promote to Admin</option>
              <option value="player">Demote to Player</option>
            </select>
            <button
              type="button"
              onClick={() => void setAdminRole()}
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
            >
              Apply Role
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-300">
        <p>Total Users: {overview?.platformTotals.users || 0}</p>
        <p>Total Balance: {(overview?.platformTotals.totalBalance || 0).toFixed(2)}</p>
        <p>Total Wagered: {(overview?.platformTotals.totalWagered || 0).toFixed(2)}</p>
        <p>Total Won: {(overview?.platformTotals.totalWon || 0).toFixed(2)}</p>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
        <h2 className="mb-3 text-sm uppercase tracking-wide text-slate-500">Recent Audit Log</h2>
        <ul className="max-h-80 space-y-2 overflow-auto pr-1">
          {audit.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
              <p>
                {entry.action} by {entry.actor} ({entry.actorRole})
              </p>
              <p className="text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
            </li>
          ))}
          {audit.length === 0 && <li className="text-sm text-slate-400">No audit data available.</li>}
        </ul>
      </section>

      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</p>}
    </section>
  );
}
