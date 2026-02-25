import { useEffect, useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';

function Settings() {
  const { user } = useAuth();
  const { muted, setMuted, masterVolume, setMasterVolume, sfxVolume, setSfxVolume, unlockAudio } = useSound();
  const [settings, setSettings] = useState({
    emailPromotions: true,
    gameSounds: !muted,
    quickBetConfirm: false,
    twoFactor: false
  });

  const toggle = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    setSettings((prev) => ({ ...prev, gameSounds: !muted }));
  }, [muted]);

  return (
    <section className="page-section">
      {/* PAGE HEADER */}
      <header className="page-header">
        <h1>Settings</h1>
        <p>Manage account, preferences, and security controls.</p>
      </header>

      {/* SETTINGS GRID */}
      <div className="settings-grid">
        <Card className="settings-card">
          <h3>Profile</h3>
          <p>Username: {user.username}</p>
          <p>Email: {user.email}</p>
          <p>Currency: {user.currency}</p>
          <Button variant="outline">Edit Profile</Button>
        </Card>

        <Card className="settings-card">
          <h3>Security</h3>
          <label className="setting-row">
            <span>Two-factor authentication</span>
            <input
              type="checkbox"
              checked={settings.twoFactor}
              onChange={() => toggle('twoFactor')}
            />
          </label>
          <Button variant="outline">Change Password</Button>
        </Card>

        <Card className="settings-card">
          <h3>Preferences</h3>
          <label className="setting-row">
            <span>Email promotions</span>
            <input
              type="checkbox"
              checked={settings.emailPromotions}
              onChange={() => toggle('emailPromotions')}
            />
          </label>
          <label className="setting-row">
            <span>Game sounds</span>
            <input
              type="checkbox"
              checked={settings.gameSounds}
              onChange={() => {
                const nextEnabled = !settings.gameSounds;
                setSettings((prev) => ({ ...prev, gameSounds: nextEnabled }));
                setMuted(!nextEnabled);
                if (nextEnabled) unlockAudio();
              }}
            />
          </label>
          <label className="setting-row setting-row-column">
            <span>Master volume ({Math.round(masterVolume * 100)}%)</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={masterVolume}
              onChange={(event) => setMasterVolume(event.target.value)}
            />
          </label>
          <label className="setting-row setting-row-column">
            <span>SFX volume ({Math.round(sfxVolume * 100)}%)</span>
            <input type="range" min="0" max="1" step="0.01" value={sfxVolume} onChange={(event) => setSfxVolume(event.target.value)} />
          </label>
          <label className="setting-row">
            <span>Quick bet confirmation</span>
            <input
              type="checkbox"
              checked={settings.quickBetConfirm}
              onChange={() => toggle('quickBetConfirm')}
            />
          </label>
        </Card>

        <Card className="settings-card">
          <h3>Responsible Play</h3>
          <p>Set personal limits and manage your play session behavior.</p>
          <div className="wallet-actions">
            <Button variant="outline">Deposit Limit</Button>
            <Button variant="outline">Session Reminder</Button>
            <Button as="link" to="/responsible-gambling" variant="outline">
              Learn More
            </Button>
          </div>
        </Card>
      </div>
    </section>
  );
}

export default Settings;
