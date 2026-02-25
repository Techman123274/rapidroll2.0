import { useMemo, useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';

const PROMO_TABS = ['Basics', 'Audience', 'Reward', 'Schedule', 'Creative', 'Review'];

const defaultPromoForm = {
  id: null,
  name: '',
  title: '',
  description: '',
  image: '/site/promo-default.svg',
  badge: 'New',
  cta: 'Claim',
  path: '/promotions',
  amount: 0,
  uses: 0,
  enabled: true,
  audience: 'all',
  rewardType: 'daily_boost',
  placement: 'promotions',
  promoCode: '',
  startAt: '',
  endAt: '',
  notifyOnPublish: false
};

const getPromotionStatus = (promo) => {
  const now = Date.now();
  if (!promo?.enabled) return 'disabled';
  if (promo?.startAt && now < new Date(promo.startAt).getTime()) return 'scheduled';
  if (promo?.endAt && now > new Date(promo.endAt).getTime()) return 'expired';
  return 'active';
};

function Admin() {
  const { user } = useAuth();
  const {
    users,
    promotions,
    globalMessages,
    adminMessages,
    auditLogs,
    games,
    isSiteOnline,
    setUserPassword,
    addPromotion,
    updatePromotion,
    clearGlobalChat,
    deleteGlobalMessage,
    postAnnouncement,
    sendAdminMessage,
    addAdmin,
    removeAdmin,
    toggleSiteOnline,
    toggleGameEnabled,
    refreshState
  } = useAdmin();

  const [passwordDrafts, setPasswordDrafts] = useState({});
  const [promoForm, setPromoForm] = useState(defaultPromoForm);
  const [promoTab, setPromoTab] = useState(PROMO_TABS[0]);
  const [promoFilter, setPromoFilter] = useState('all');
  const [promoSearch, setPromoSearch] = useState('');
  const [newAdmin, setNewAdmin] = useState({ username: '', email: '', password: '' });
  const [announcement, setAnnouncement] = useState('');
  const [adminDraft, setAdminDraft] = useState('');

  const filteredPromotions = useMemo(() => {
    return promotions.filter((promo) => {
      const status = getPromotionStatus(promo);
      const matchesFilter = promoFilter === 'all' || status === promoFilter;
      const term = promoSearch.trim().toLowerCase();
      const matchesSearch =
        !term ||
        String(promo.title || '').toLowerCase().includes(term) ||
        String(promo.name || '').toLowerCase().includes(term) ||
        String(promo.promoCode || '').toLowerCase().includes(term);
      return matchesFilter && matchesSearch;
    });
  }, [promotions, promoFilter, promoSearch]);

  const resetPromoForm = () => {
    setPromoForm(defaultPromoForm);
    setPromoTab(PROMO_TABS[0]);
  };

  const loadPromoForEdit = (promo) => {
    setPromoForm({
      id: promo._id || promo.id,
      name: promo.name || promo.title || '',
      title: promo.title || promo.name || '',
      description: promo.description || '',
      image: promo.image || '/site/promo-default.svg',
      badge: promo.badge || 'New',
      cta: promo.cta || 'Claim',
      path: promo.path || '/promotions',
      amount: Number(promo.amount || 0),
      uses: Number(promo.uses || 0),
      enabled: promo.enabled !== false,
      audience: promo.audience || 'all',
      rewardType: promo.rewardType || 'daily_boost',
      placement: promo.placement || 'promotions',
      promoCode: promo.promoCode || '',
      startAt: promo.startAt ? new Date(promo.startAt).toISOString().slice(0, 16) : '',
      endAt: promo.endAt ? new Date(promo.endAt).toISOString().slice(0, 16) : '',
      notifyOnPublish: Boolean(promo.notifyOnPublish)
    });
    setPromoTab(PROMO_TABS[0]);
  };

  const submitPromo = async (event) => {
    event.preventDefault();
    if (!promoForm.name || !promoForm.description) return;

    const payload = {
      ...promoForm,
      title: promoForm.title || promoForm.name,
      amount: Number(promoForm.amount || 0),
      uses: Number(promoForm.uses || 0),
      startAt: promoForm.startAt || null,
      endAt: promoForm.endAt || null,
      image: promoForm.image || '/site/promo-default.svg',
      rewardConfig: {
        amount: Number(promoForm.amount || 0),
        uses: Number(promoForm.uses || 0),
        promoCode: promoForm.promoCode || ''
      }
    };

    if (payload.id) {
      await updatePromotion(payload.id, payload);
    } else {
      await addPromotion(payload);
    }

    resetPromoForm();
  };

  const togglePromoEnabled = async (promo) => {
    const id = promo._id || promo.id;
    await updatePromotion(id, { enabled: !promo.enabled });
  };

  const submitAnnouncement = (event) => {
    event.preventDefault();
    postAnnouncement(announcement);
    setAnnouncement('');
  };

  const submitAdminChat = (event) => {
    event.preventDefault();
    sendAdminMessage(user.username, adminDraft);
    setAdminDraft('');
  };

  const submitAddAdmin = (event) => {
    event.preventDefault();
    addAdmin(newAdmin);
    setNewAdmin({ username: '', email: '', password: '' });
  };

  return (
    <section className="page-section">
      <header className="page-header">
        <h1>{user.role === 'owner' ? 'Owner Control Panel' : 'Admin Panel'}</h1>
        <p>Manage users, promotions, chats, and platform operations from one place.</p>
      </header>

      <div className="admin-grid">
        <Card className="admin-card">
          <h3>User Passwords</h3>
          <ul className="admin-list">
            {users.map((account) => (
              <li key={account.id || account._id}>
                <div>
                  <strong>{account.username}</strong>
                  <p>
                    {account.email} ({account.role})
                  </p>
                </div>
                <div className="admin-inline-form">
                  <input
                    type="text"
                    value={passwordDrafts[account.id || account._id] ?? ''}
                    onChange={(event) =>
                      setPasswordDrafts((prev) => ({
                        ...prev,
                        [account.id || account._id]: event.target.value
                      }))
                    }
                    placeholder="new password"
                  />
                  <Button
                    variant="outline"
                    onClick={() =>
                      setUserPassword(account.id || account._id, passwordDrafts[account.id || account._id] ?? '')
                    }
                  >
                    Update
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="admin-card admin-promotions-card">
          <div className="admin-promo-head">
            <h3>Promotion Manager</h3>
            <span>{promotions.length} total</span>
          </div>

          <div className="admin-inline-form">
            <input
              type="text"
              placeholder="Search title, name, promo code"
              value={promoSearch}
              onChange={(event) => setPromoSearch(event.target.value)}
            />
            <select value={promoFilter} onChange={(event) => setPromoFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
              <option value="expired">Expired</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

          <ul className="admin-list admin-list-tight admin-promo-list">
            {filteredPromotions.map((promo) => {
              const status = getPromotionStatus(promo);
              return (
                <li key={promo._id || promo.id}>
                  <div>
                    <strong>{promo.title}</strong>
                    <p>
                      {promo.audience || 'all'} • {promo.rewardType || 'daily_boost'} • {status}
                    </p>
                    <p>
                      Uses Left: {Number(promo.usesRemaining || 0)} / {Number(promo.uses || 0)}
                    </p>
                    <p>
                      Views: {Number(promo.views || 0)} • Claims: {Number(promo.claims || 0)} • Conversions:{' '}
                      {Number(promo.conversions || 0)}
                    </p>
                  </div>
                  <div className="admin-inline-form">
                    <Button variant="outline" onClick={() => loadPromoForEdit(promo)}>
                      Edit
                    </Button>
                    <Button variant="outline" onClick={() => void togglePromoEnabled(promo)}>
                      {promo.enabled === false ? 'Enable' : 'Disable'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="admin-promo-tabs" role="tablist" aria-label="Promotion editor tabs">
            {PROMO_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`promo-filter ${promoTab === tab ? 'is-active' : ''}`}
                onClick={() => setPromoTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <form className="admin-form" onSubmit={(event) => void submitPromo(event)}>
            {promoTab === 'Basics' && (
              <>
                <input
                  type="text"
                  placeholder="Promo Name"
                  value={promoForm.name}
                  onChange={(event) => setPromoForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
                <input
                  type="text"
                  placeholder="Title"
                  value={promoForm.title}
                  onChange={(event) => setPromoForm((prev) => ({ ...prev, title: event.target.value }))}
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={promoForm.description}
                  onChange={(event) => setPromoForm((prev) => ({ ...prev, description: event.target.value }))}
                  required
                />
              </>
            )}

            {promoTab === 'Audience' && (
              <>
                <label>
                  Audience
                  <select
                    value={promoForm.audience}
                    onChange={(event) => setPromoForm((prev) => ({ ...prev, audience: event.target.value }))}
                  >
                    <option value="all">All users</option>
                    <option value="vip">VIP only</option>
                    <option value="new_users">New users</option>
                    <option value="inactive_users">Inactive users</option>
                  </select>
                </label>
                <label>
                  Placement
                  <select
                    value={promoForm.placement}
                    onChange={(event) => setPromoForm((prev) => ({ ...prev, placement: event.target.value }))}
                  >
                    <option value="lobby">Lobby</option>
                    <option value="promotions">Promotions page</option>
                    <option value="game">Game page</option>
                    <option value="vip">VIP page</option>
                  </select>
                </label>
              </>
            )}

            {promoTab === 'Reward' && (
              <>
                <label>
                  Reward Type
                  <select
                    value={promoForm.rewardType}
                    onChange={(event) => setPromoForm((prev) => ({ ...prev, rewardType: event.target.value }))}
                  >
                    <option value="deposit_bonus">Deposit bonus</option>
                    <option value="daily_boost">Daily reward boost</option>
                    <option value="free_spins">Free spins</option>
                    <option value="cashback">Cashback</option>
                    <option value="challenge_boost">Challenge boost</option>
                    <option value="leaderboard_event">Leaderboard event</option>
                    <option value="promo_code">Promo code</option>
                  </select>
                </label>
                <div className="admin-row-two">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Amount"
                    value={promoForm.amount}
                    onChange={(event) => setPromoForm((prev) => ({ ...prev, amount: event.target.value }))}
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Uses"
                    value={promoForm.uses}
                    onChange={(event) => setPromoForm((prev) => ({ ...prev, uses: event.target.value }))}
                  />
                </div>
                <input
                  type="text"
                  placeholder="Promo Code (optional)"
                  value={promoForm.promoCode}
                  onChange={(event) => setPromoForm((prev) => ({ ...prev, promoCode: event.target.value.toUpperCase() }))}
                />
              </>
            )}

            {promoTab === 'Schedule' && (
              <>
                <label>
                  Start
                  <input
                    type="datetime-local"
                    value={promoForm.startAt}
                    onChange={(event) => setPromoForm((prev) => ({ ...prev, startAt: event.target.value }))}
                  />
                </label>
                <label>
                  End
                  <input
                    type="datetime-local"
                    value={promoForm.endAt}
                    onChange={(event) => setPromoForm((prev) => ({ ...prev, endAt: event.target.value }))}
                  />
                </label>
                <label className="admin-check-label">
                  <input
                    type="checkbox"
                    checked={promoForm.enabled}
                    onChange={(event) => setPromoForm((prev) => ({ ...prev, enabled: event.target.checked }))}
                  />
                  Promotion enabled
                </label>
              </>
            )}

            {promoTab === 'Creative' && (
              <>
                <input
                  type="text"
                  placeholder="Image URL"
                  value={promoForm.image}
                  onChange={(event) => setPromoForm((prev) => ({ ...prev, image: event.target.value }))}
                />
                <div className="admin-row-two">
                  <input
                    type="text"
                    placeholder="Badge"
                    value={promoForm.badge}
                    onChange={(event) => setPromoForm((prev) => ({ ...prev, badge: event.target.value }))}
                  />
                  <input
                    type="text"
                    placeholder="CTA"
                    value={promoForm.cta}
                    onChange={(event) => setPromoForm((prev) => ({ ...prev, cta: event.target.value }))}
                  />
                </div>
                <input
                  type="text"
                  placeholder="Path"
                  value={promoForm.path}
                  onChange={(event) => setPromoForm((prev) => ({ ...prev, path: event.target.value }))}
                />
              </>
            )}

            {promoTab === 'Review' && (
              <div className="admin-promo-preview">
                <h4>{promoForm.title || promoForm.name || 'Untitled Promotion'}</h4>
                <p>{promoForm.description || 'No description yet.'}</p>
                <p>
                  {promoForm.audience} • {promoForm.rewardType} • {promoForm.placement}
                </p>
                <label className="admin-check-label">
                  <input
                    type="checkbox"
                    checked={promoForm.notifyOnPublish}
                    onChange={(event) => setPromoForm((prev) => ({ ...prev, notifyOnPublish: event.target.checked }))}
                  />
                  Notify eligible users on publish
                </label>
              </div>
            )}

            <div className="admin-inline-form">
              <Button type="submit">{promoForm.id ? 'Update Promotion' : 'Create Promotion'}</Button>
              <Button type="button" variant="outline" onClick={resetPromoForm}>
                Reset
              </Button>
            </div>
          </form>
        </Card>

        <Card className="admin-card">
          <h3>Site Notifications & Chat</h3>
          <form className="admin-inline-form" onSubmit={submitAnnouncement}>
            <input
              type="text"
              placeholder="Send site notification"
              value={announcement}
              onChange={(event) => setAnnouncement(event.target.value)}
            />
            <Button variant="outline">Notify</Button>
          </form>
          <Button variant="outline" onClick={clearGlobalChat}>
            Clear Global Chat
          </Button>
          <ul className="admin-list admin-list-tight">
            {globalMessages.map((message) => (
              <li key={message._id || message.id}>
                <div>
                  <strong>{message.user}</strong>
                  <p>{message.text}</p>
                </div>
                <Button variant="outline" onClick={() => deleteGlobalMessage(message._id || message.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="admin-card">
          <h3>Admin Team Chat</h3>
          <ul className="admin-chat-list">
            {adminMessages.map((message) => (
              <li key={message._id || message.id}>
                <strong>{message.user}</strong>
                <p>{message.text}</p>
              </li>
            ))}
          </ul>
          <form className="admin-inline-form" onSubmit={submitAdminChat}>
            <input
              type="text"
              placeholder="message admin team"
              value={adminDraft}
              onChange={(event) => setAdminDraft(event.target.value)}
            />
            <Button>Send</Button>
          </form>
        </Card>

        <Card className="admin-card">
          <h3>System Logs</h3>
          <Button variant="outline" onClick={refreshState}>
            Refresh Logs
          </Button>
          <ul className="admin-chat-list admin-list-tight">
            {auditLogs.map((log) => (
              <li key={log._id || log.id}>
                <strong>{log.action}</strong>
                <p>
                  {new Date(log.createdAt).toLocaleString()} • {log.actor} ({log.actorRole})
                </p>
                {log.target && <p>Target: {log.target}</p>}
              </li>
            ))}
          </ul>
        </Card>

        {user.role === 'owner' && (
          <>
            <Card className="admin-card owner-card">
              <h3>Owner Controls</h3>
              <p>
                Site status: <strong>{isSiteOnline ? 'Online' : 'Maintenance / Offline'}</strong>
              </p>
              <Button variant="outline" onClick={toggleSiteOnline}>
                {isSiteOnline ? 'Shut Site Down' : 'Bring Site Online'}
              </Button>
            </Card>

            <Card className="admin-card owner-card">
              <h3>Admin Management</h3>
              <form className="admin-form" onSubmit={submitAddAdmin}>
                <input
                  type="text"
                  placeholder="Admin username"
                  value={newAdmin.username}
                  onChange={(event) => setNewAdmin((prev) => ({ ...prev, username: event.target.value }))}
                  required
                />
                <input
                  type="email"
                  placeholder="Admin email"
                  value={newAdmin.email}
                  onChange={(event) => setNewAdmin((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
                <input
                  type="text"
                  placeholder="Temp password"
                  value={newAdmin.password}
                  onChange={(event) => setNewAdmin((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
                <Button>Add Admin</Button>
              </form>
              <ul className="admin-list">
                {users
                  .filter((account) => account.role === 'admin')
                  .map((account) => (
                    <li key={account.id || account._id}>
                      <div>
                        <strong>{account.username}</strong>
                        <p>{account.email}</p>
                      </div>
                      <Button variant="outline" onClick={() => removeAdmin(account.id || account._id)}>
                        Remove Admin
                      </Button>
                    </li>
                  ))}
              </ul>
            </Card>

            <Card className="admin-card owner-card">
              <h3>Game Availability</h3>
              <ul className="admin-list">
                {games.map((game) => (
                  <li key={game.slug}>
                    <div>
                      <strong>{game.title}</strong>
                      <p>{game.enabled ? 'Enabled' : 'Disabled'}</p>
                    </div>
                    <Button variant="outline" onClick={() => toggleGameEnabled(game.slug)}>
                      {game.enabled ? 'Stop Game' : 'Enable Game'}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>
    </section>
  );
}

export default Admin;
