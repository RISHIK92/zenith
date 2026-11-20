import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Flame,
  LayoutDashboard,
  LogOut,
  Mountain,
  Play,
  Settings,
  Shield,
  Timer,
  Trophy,
  Users,
} from 'lucide-react';
import { ActivityView } from './components/ActivityView';
import { AuthView } from './components/AuthView';
import { BlockerView } from './components/BlockerView';
import { FocusTimerView, formatClock } from './components/FocusTimerView';
import { GamificationView } from './components/GamificationView';
import { RoomsView } from './components/RoomsView';
import { SettingsView } from './components/SettingsView';
import type {
  ActiveTimer,
  BlockedResource,
  DashboardData,
  FocusEvent,
  FocusSession,
  GamificationData,
  MonitorStatus,
  Room,
  SyncStatus,
  User,
} from './types';

type Tab = 'overview' | 'timer' | 'rooms' | 'blocker' | 'activity' | 'achievements' | 'settings';

type Toast = { id: number; text: string; tone: 'success' | 'warn' | 'gold' };

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedRoomId, setSelectedRoomId] = useState('');

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [resources, setResources] = useState<BlockedResource[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [events, setEvents] = useState<FocusEvent[]>([]);
  const [gamification, setGamification] = useState<GamificationData | null>(null);
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const refreshAll = useCallback(async () => {
    const [dash, rms, res, sess, evs, gam, mon, sync] = await Promise.all([
      window.zenithAPI.dashboard.get(),
      window.zenithAPI.rooms.list(),
      window.zenithAPI.blocker.list(),
      window.zenithAPI.sessions.list(),
      window.zenithAPI.events.list(),
      window.zenithAPI.gamification.get(),
      window.zenithAPI.monitor.status(),
      window.zenithAPI.sync.status(),
    ]);
    setUser(dash.user);
    setDashboard(dash);
    setActiveTimer(dash.activeTimer);
    setRooms(rms);
    setResources(res);
    setSessions(sess);
    setEvents(evs);
    setGamification(gam);
    setMonitorStatus(mon);
    setSyncStatus(sync);
  }, []);

  useEffect(() => {
    window.zenithAPI.auth
      .current()
      .then((u) => {
        if (u) setUser(u);
      })
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshAll().catch(() => {});
  }, [user?.id, refreshAll]);

  // Subscribe to Main -> Renderer IPC push events
  useEffect(() => {
    if (!user) return;
    const unsubTick = window.zenithAPI.onTimerTick((t) => setActiveTimer(t));
    const unsubDone = window.zenithAPI.onSessionCompleted((payload) => {
      pushToast(`Session completed: "${payload.session.title}" (+${payload.pointsEarned} pts)`, 'success');
      refreshAll().catch(() => {});
    });
    const unsubAch = window.zenithAPI.onAchievementUnlocked((ach) => {
      pushToast(`Achievement unlocked: ${ach.title} (+${ach.pointsReward} pts)`, 'gold');
      refreshAll().catch(() => {});
    });
    const unsubBlock = window.zenithAPI.onDistractionBlocked((res) => {
      pushToast(`Distraction blocked: ${res.domainOrApp} (+5 pts)`, 'warn');
      refreshAll().catch(() => {});
    });
    const unsubMon = window.zenithAPI.onMonitorStatus((st) => setMonitorStatus(st));
    const unsubSync = window.zenithAPI.onSyncStatus((st) => {
      setSyncStatus(st);
      window.zenithAPI.rooms.list().then(setRooms).catch(() => {});
    });
    const unsubRooms = window.zenithAPI.onRoomsSynced(() => {
      window.zenithAPI.rooms.list().then(setRooms).catch(() => {});
    });
    return () => {
      unsubTick();
      unsubDone();
      unsubAch();
      unsubBlock();
      unsubMon();
      unsubSync();
      unsubRooms();
    };
  }, [user?.id, pushToast, refreshAll]);

  const handleLogout = async () => {
    await window.zenithAPI.auth.logout();
    setUser(null);
    setDashboard(null);
    setActiveTimer(null);
    setTab('overview');
  };

  if (booting) {
    return (
      <div className="auth-page">
        <div style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Loading Zenith...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthView onAuthenticated={(u) => setUser(u)} />;
  }

  const stats = dashboard?.stats;
  const goalPct = stats ? Math.min(100, Math.round((stats.todayFocusMinutes / Math.max(1, stats.dailyGoalMinutes)) * 100)) : 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Mountain size={19} />
          </div>
          <div>
            <div className="brand-title">Zenith</div>
            <div className="brand-sub">Focus & Productivity</div>
          </div>
        </div>

        <nav className="nav-list">
          <button className={`nav-btn ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
            <LayoutDashboard size={17} /> Overview
          </button>
          <button className={`nav-btn ${tab === 'timer' ? 'active' : ''}`} onClick={() => setTab('timer')}>
            <Timer size={17} /> Focus Timer
            {activeTimer && <span className="timer-pill">{formatClock(activeTimer.remainingSeconds)}</span>}
          </button>
          <button className={`nav-btn ${tab === 'rooms' ? 'active' : ''}`} onClick={() => setTab('rooms')}>
            <Users size={17} /> Focus Rooms
          </button>
          <button className={`nav-btn ${tab === 'blocker' ? 'active' : ''}`} onClick={() => setTab('blocker')}>
            <Shield size={17} /> Distraction Blocker
          </button>
          <button className={`nav-btn ${tab === 'activity' ? 'active' : ''}`} onClick={() => setTab('activity')}>
            <Activity size={17} /> Activity & Events
          </button>
          <button className={`nav-btn ${tab === 'achievements' ? 'active' : ''}`} onClick={() => setTab('achievements')}>
            <Trophy size={17} /> Achievements
          </button>
          <button className={`nav-btn ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
            <Settings size={17} /> Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{user.displayName.slice(0, 2).toUpperCase()}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.displayName}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {stats?.points ?? user.points} pts · {stats?.streakDays ?? user.streakDays}d streak
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout} style={{ width: '100%' }}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        {tab === 'overview' && (
          <div>
            <div className="page-header">
              <div>
                <h1 className="page-title">Good focus, {user.displayName.split(' ')[0]}</h1>
                <p className="page-subtitle">
                  Track your daily focus goal, collaborate in rooms, and keep distractions blocked.
                </p>
              </div>
              <button className="btn btn-primary" onClick={() => setTab('timer')}>
                <Play size={16} /> {activeTimer ? 'Open Active Timer' : 'Start Focus Session'}
              </button>
            </div>

            <div className="grid-4">
              <div className="stat-card">
                <div className="stat-top">
                  <span>Today&apos;s Focus</span>
                  <div className="stat-icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                    <Timer size={16} />
                  </div>
                </div>
                <div className="stat-value">{stats?.todayFocusMinutes ?? 0}m</div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${goalPct}%` }} />
                </div>
                <div className="stat-sub">
                  {goalPct}% of {stats?.dailyGoalMinutes ?? 120}m daily goal
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Zenith Points</span>
                  <div className="stat-icon" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
                    <Trophy size={16} />
                  </div>
                </div>
                <div className="stat-value">{stats?.points ?? 0}</div>
                <div className="stat-sub">{stats?.completedSessions ?? 0} sessions completed</div>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Distractions Blocked</span>
                  <div className="stat-icon" style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}>
                    <Shield size={16} />
                  </div>
                </div>
                <div className="stat-value">{stats?.totalBlockedCount ?? 0}</div>
                <div className="stat-sub">{stats?.blockedResourceCount ?? 0} rules configured</div>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Consistency Streak</span>
                  <div className="stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
                    <Flame size={16} />
                  </div>
                </div>
                <div className="stat-value">{stats?.streakDays ?? 1} days</div>
                <div className="stat-sub">{stats?.roomsJoined ?? 0} focus rooms joined</div>
              </div>
            </div>

            <div className="grid-2">
              <div className="card">
                <div className="card-title">
                  <span>Recent Focus Sessions</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => setTab('activity')}>
                    View All
                  </button>
                </div>
                {(dashboard?.recentSessions.length ?? 0) === 0 ? (
                  <div className="empty-state">No focus sessions yet. Start your first session!</div>
                ) : (
                  <div className="stack" style={{ gap: 10 }}>
                    {dashboard?.recentSessions.slice(0, 5).map((s) => (
                      <div
                        key={s.id}
                        className="row-between"
                        style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg)' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {s.actualMinutes}m focused {s.roomName ? `· ${s.roomName}` : '· Solo'}
                          </div>
                        </div>
                        <span className={`badge ${s.status === 'COMPLETED' ? 'badge-teal' : 'badge-muted'}`}>
                          {s.status === 'COMPLETED' ? `+${s.pointsEarned} pts` : s.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="card-title">
                  <span>Recent Activity Events</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => setTab('activity')}>
                    Timeline
                  </button>
                </div>
                {(dashboard?.recentEvents.length ?? 0) === 0 ? (
                  <div className="empty-state">No events logged yet.</div>
                ) : (
                  <div className="stack" style={{ gap: 10 }}>
                    {dashboard?.recentEvents.slice(0, 6).map((ev) => (
                      <div key={ev.id} className="row-between" style={{ fontSize: 13 }}>
                        <div className="row-gap">
                          <span className="badge badge-indigo">{ev.eventType.replace('_', ' ')}</span>
                          <span style={{ fontWeight: 500 }}>{ev.resourceLabel || '—'}</span>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'timer' && (
          <FocusTimerView
            user={user}
            activeTimer={activeTimer}
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            onSelectRoomId={setSelectedRoomId}
            onRefresh={refreshAll}
          />
        )}

        {tab === 'rooms' && (
          <RoomsView
            rooms={rooms}
            syncStatus={syncStatus}
            onRefresh={refreshAll}
            onStartFocusInRoom={(roomId) => {
              setSelectedRoomId(roomId);
              setTab('timer');
            }}
          />
        )}

        {tab === 'blocker' && (
          <BlockerView resources={resources} monitorStatus={monitorStatus} onRefresh={refreshAll} />
        )}
        {tab === 'activity' && <ActivityView sessions={sessions} events={events} />}
        {tab === 'achievements' && <GamificationView data={gamification} />}
        {tab === 'settings' && <SettingsView user={user} onUpdated={(u) => setUser(u)} />}
      </main>

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
