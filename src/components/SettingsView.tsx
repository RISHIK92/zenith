import { FormEvent, useEffect, useState } from 'react';
import { Cpu, Save } from 'lucide-react';
import type { SystemInfo, User } from '../types';

type Props = {
  user: User;
  onUpdated: (user: User) => void;
};

export function SettingsView({ user, onUpdated }: Props) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(user.dailyGoalMinutes);
  const [defaultFocusMinutes, setDefaultFocusMinutes] = useState(user.settings.defaultFocusMinutes);
  const [shortBreakMinutes, setShortBreakMinutes] = useState(user.settings.shortBreakMinutes);
  const [strictBlocking, setStrictBlocking] = useState(user.settings.strictBlocking);
  const [desktopNotifications, setDesktopNotifications] = useState(user.settings.desktopNotifications);
  const [saved, setSaved] = useState(false);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    window.zenithAPI.system.info().then(setSysInfo).catch(() => {});
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const updated = await window.zenithAPI.settings.update({
      displayName,
      dailyGoalMinutes,
      settings: {
        defaultFocusMinutes,
        shortBreakMinutes,
        strictBlocking,
        desktopNotifications,
      },
    });
    onUpdated(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Personalized Settings</h1>
          <p className="page-subtitle">
            Customize your focus targets, distraction enforcement, and desktop notifications.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <form className="card stack" onSubmit={handleSave}>
          <div className="card-title">Focus Preferences</div>

          <div className="field">
            <label className="label">Display Name</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>

          <div className="field">
            <label className="label">Daily Focus Goal (minutes)</label>
            <input
              className="input"
              type="number"
              min={15}
              max={720}
              value={dailyGoalMinutes}
              onChange={(e) => setDailyGoalMinutes(Number(e.target.value) || 120)}
            />
          </div>

          <div className="grid-2" style={{ gap: 12 }}>
            <div className="field">
              <label className="label">Default Focus Block (min)</label>
              <input
                className="input"
                type="number"
                min={5}
                max={180}
                value={defaultFocusMinutes}
                onChange={(e) => setDefaultFocusMinutes(Number(e.target.value) || 25)}
              />
            </div>
            <div className="field">
              <label className="label">Short Break (min)</label>
              <input
                className="input"
                type="number"
                min={1}
                max={30}
                value={shortBreakMinutes}
                onChange={(e) => setShortBreakMinutes(Number(e.target.value) || 5)}
              />
            </div>
          </div>

          <div className="row-between" style={{ paddingTop: 6 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Strict Distraction Blocking</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                Enforce active blocklist rules and log every blocked attempt.
              </div>
            </div>
            <button
              type="button"
              className={`toggle ${strictBlocking ? 'on' : ''}`}
              onClick={() => setStrictBlocking((v) => !v)}
            />
          </div>

          <div className="row-between">
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Desktop Notifications</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                Receive native OS notifications from the Main process on session completion.
              </div>
            </div>
            <button
              type="button"
              className={`toggle ${desktopNotifications ? 'on' : ''}`}
              onClick={() => setDesktopNotifications((v) => !v)}
            />
          </div>

          <div className="row-gap" style={{ marginTop: 6 }}>
            <button className="btn btn-primary" type="submit">
              <Save size={15} /> Save Preferences
            </button>
            {saved && <span className="badge badge-teal">Saved to SQLite!</span>}
          </div>
        </form>

        <div className="card stack">
          <div className="card-title">
            <span>Electron IPC & Process Architecture</span>
            <Cpu size={16} color="var(--primary)" />
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            Zenith isolates the UI in a sandboxed <strong>Renderer Process</strong> (React + Vite) with{' '}
            <span className="mono">contextIsolation: true</span> and <span className="mono">nodeIntegration: false</span>.
            All database queries, timers, and OS notifications run inside the <strong>Main Process</strong>, exposed via
            an allowlisted <span className="mono">contextBridge</span> preload script.
          </p>

          {sysInfo && (
            <table className="table">
              <tbody>
                <tr>
                  <td style={{ color: 'var(--text-muted)' }}>Platform</td>
                  <td className="mono">{sysInfo.platform}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)' }}>Electron</td>
                  <td className="mono">v{sysInfo.electronVersion}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)' }}>Node.js (Main)</td>
                  <td className="mono">v{sysInfo.nodeVersion}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)' }}>Chromium (Renderer)</td>
                  <td className="mono">v{sysInfo.chromeVersion}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--text-muted)' }}>SQLite Database</td>
                  <td className="mono" style={{ wordBreak: 'break-all' }}>
                    {sysInfo.dbPath}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
