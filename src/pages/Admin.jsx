import { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';

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
  const [promoForm, setPromoForm] = useState({
    name: '',
    title: '',
    description: '',
    image: '',
    badge: 'New',
    cta: 'Claim',
    path: '/promotions',
    amount: 0,
    uses: 0
  });
  const [newAdmin, setNewAdmin] = useState({ username: '', email: '', password: '' });
  const [announcement, setAnnouncement] = useState('');
  const [adminDraft, setAdminDraft] = useState('');

  const submitPromo = (event) => {
    event.preventDefault();
    if (!promoForm.name || !promoForm.description) return;

    addPromotion({
      ...promoForm,
      title: promoForm.title || promoForm.name,
      amount: Number(promoForm.amount || 0),
      uses: Number(promoForm.uses || 0),
      image: promoForm.image || '/site/promo-default.svg'
    });

    setPromoForm({
      name: '',
      title: '',
      description: '',
      image: '',
      badge: 'New',
      cta: 'Claim',
      path: '/promotions',
      amount: 0,
      uses: 0
    });
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
      {/* PAGE HEADER */}
      <header className="page-header">
        <h1>{user.role === 'owner' ? 'Owner Control Panel' : 'Admin Panel'}</h1>
        <p>Manage users, promotions, chats, and platform operations from one place.</p>
      </header>

      {/* ADMIN GRID */}
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

        <Card className="admin-card">
          <h3>Add Promotion</h3>
          <form className="admin-form" onSubmit={submitPromo}>
            <input
              type="text"
              placeholder="Promo Name"
              value={promoForm.name}
              onChange={(event) => setPromoForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <input
              type="text"
              placeholder="Title (optional)"
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
            <input
              type="text"
              placeholder="Image URL (optional)"
              value={promoForm.image}
              onChange={(event) => setPromoForm((prev) => ({ ...prev, image: event.target.value }))}
            />
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
            <Button>Add Promotion</Button>
          </form>
          <p className="admin-meta">Total promotions: {promotions.length}</p>
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
