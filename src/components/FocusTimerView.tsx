import { useState } from 'react';
import { CheckCircle2, Pause, Play, ShieldAlert, Square, Timer } from 'lucide-react';
import type { ActiveTimer, Room, User } from '../types';

type Props = {
  user: User;
  activeTimer: ActiveTimer | null;
  rooms: Room[];
  selectedRoomId: string;
  onSelectRoomId: (id: string) => void;
  onRefresh: () => Promise<void>;
};

const PRESETS = [15, 25, 45, 60];

export function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function FocusTimerView({ user, activeTimer, rooms, selectedRoomId, onSelectRoomId, onRefresh }: Props) {
  const [title, setTitle] = useState('Deep Work Sprint');
  const [minutes, setMinutes] = useState(user.settings.defaultFocusMinutes || 25);
  const [checkUrl, setCheckUrl] = useState('');
  const [checkFeedback, setCheckFeedback] = useState<{ blocked: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const plannedSeconds = activeTimer ? activeTimer.plannedSeconds : minutes * 60;
  const remainingSeconds = activeTimer ? activeTimer.remainingSeconds : minutes * 60;
  const progress = plannedSeconds > 0 ? 1 - remainingSeconds / plannedSeconds : 0;

  const radius = 104;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  const handleStart = async () => {
    setBusy(true);
    try {
      await window.zenithAPI.sessions.start({
        title: title.trim() || 'Deep Work Sprint',
        plannedMinutes: minutes,
        roomId: selectedRoomId || null,
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const handlePauseResume = async () => {
    if (!activeTimer) return;
    if (activeTimer.status === 'ACTIVE') await window.zenithAPI.sessions.pause();
    else await window.zenithAPI.sessions.resume();
  };

  const handleComplete = async () => {
    await window.zenithAPI.sessions.complete();
    await onRefresh();
  };

  const handleCancel = async () => {
    await window.zenithAPI.sessions.cancel();
    await onRefresh();
  };

  const handleCheckDistraction = async () => {
    if (!checkUrl.trim()) return;
    const res = await window.zenithAPI.blocker.check(checkUrl.trim());
    if (res.blocked && res.resource) {
      setCheckFeedback({
        blocked: true,
        text: `Blocked "${res.resource.domainOrApp}" (${res.resource.category}) — FocusEvent logged & +5 pts awarded!`,
      });
    } else {
      setCheckFeedback({
        blocked: false,
        text: `"${checkUrl.trim()}" is not on your active blocklist.`,
      });
    }
    setCheckUrl('');
    await onRefresh();
  };

  const joinedRooms = rooms.filter((r) => r.isJoined);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Focus Timer</h1>
          <p className="page-subtitle">
            Countdown engine runs in the Electron Main process and streams live ticks over IPC.
          </p>
        </div>
        {activeTimer && (
          <span className={`badge ${activeTimer.status === 'ACTIVE' ? 'badge-teal' : 'badge-amber'}`}>
            <Timer size={13} />
            {activeTimer.status === 'ACTIVE' ? 'Session Active' : 'Paused'}
          </span>
        )}
      </div>

      <div className="grid-2">
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="timer-ring-wrap">
            <svg width="240" height="240" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="120" cy="120" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="12" />
              <circle
                cx="120"
                cy="120"
                r={radius}
                fill="none"
                stroke={activeTimer?.status === 'PAUSED' ? '#D97706' : '#4F46E5'}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                style={{ transition: 'stroke-dashoffset 0.35s ease' }}
              />
            </svg>
            <div className="timer-center">
              <div className="timer-digits">{formatClock(remainingSeconds)}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                {activeTimer ? activeTimer.title : 'Ready to focus'}
              </div>
              {activeTimer?.roomName && (
                <div className="badge badge-indigo" style={{ marginTop: 8 }}>
                  Room: {activeTimer.roomName}
                </div>
              )}
            </div>
          </div>

          {!activeTimer ? (
            <div className="stack">
              <div className="preset-row">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`preset-btn ${minutes === p ? 'selected' : ''}`}
                    onClick={() => setMinutes(p)}>
                    {p} min
                  </button>
                ))}
              </div>
              <button className="btn btn-primary" onClick={handleStart} disabled={busy} style={{ width: '100%' }}>
                <Play size={16} /> Start Focus Session
              </button>
            </div>
          ) : (
            <div className="row-gap" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={handlePauseResume}>
                {activeTimer.status === 'ACTIVE' ? (
                  <>
                    <Pause size={16} /> Pause
                  </>
                ) : (
                  <>
                    <Play size={16} /> Resume
                  </>
                )}
              </button>
              <button className="btn btn-teal" onClick={handleComplete}>
                <CheckCircle2 size={16} /> Complete & Claim Points
              </button>
              <button className="btn btn-danger" onClick={handleCancel}>
                <Square size={15} /> Cancel
              </button>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-title">Session Configuration</div>
            <div className="stack">
              <div className="field">
                <label className="label">Session Goal / Title</label>
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={Boolean(activeTimer)}
                  placeholder="e.g., Operating Systems Lab 4"
                />
              </div>

              <div className="field">
                <label className="label">Custom Duration (minutes)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={180}
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(1, Math.min(180, Number(e.target.value) || 25)))}
                  disabled={Boolean(activeTimer)}
                />
              </div>

              <div className="field">
                <label className="label">Collaborative Focus Room (Optional)</label>
                <select
                  className="select"
                  value={selectedRoomId}
                  onChange={(e) => onSelectRoomId(e.target.value)}
                  disabled={Boolean(activeTimer)}>
                  <option value="">Solo Session</option>
                  {joinedRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>Live Distraction Shield Check</span>
              <ShieldAlert size={16} color="var(--rose)" />
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Simulate opening a distracting URL or app during your focus block. Zenith checks your{' '}
              <span className="mono">BlockedResource</span> table in the Main process and logs a{' '}
              <span className="mono">FocusEvent</span>.
            </p>
            <div className="row-gap">
              <input
                className="input"
                value={checkUrl}
                onChange={(e) => setCheckUrl(e.target.value)}
                placeholder="Try youtube.com or instagram.com"
                onKeyDown={(e) => e.key === 'Enter' && handleCheckDistraction()}
              />
              <button className="btn btn-secondary" onClick={handleCheckDistraction} style={{ flexShrink: 0 }}>
                Check
              </button>
            </div>
            {checkFeedback && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  fontSize: 13,
                  background: checkFeedback.blocked ? 'var(--rose-soft)' : 'var(--teal-soft)',
                  color: checkFeedback.blocked ? 'var(--rose)' : 'var(--teal)',
                  fontWeight: 500,
                }}>
                {checkFeedback.text}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
