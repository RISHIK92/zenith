import { useState } from 'react';
import type { FocusEvent, FocusSession } from '../types';

type Props = {
  sessions: FocusSession[];
  events: FocusEvent[];
};

const EVENT_BADGE: Record<FocusEvent['eventType'], string> = {
  SESSION_STARTED: 'badge-indigo',
  SESSION_PAUSED: 'badge-amber',
  SESSION_RESUMED: 'badge-indigo',
  SESSION_COMPLETED: 'badge-teal',
  SESSION_CANCELLED: 'badge-muted',
  DISTRACTION_BLOCKED: 'badge-rose',
  ROOM_JOINED: 'badge-indigo',
  GOAL_UPDATED: 'badge-muted',
};

export function ActivityView({ sessions, events }: Props) {
  const [filter, setFilter] = useState<string>('ALL');

  const filteredEvents = filter === 'ALL' ? events : events.filter((e) => e.eventType === filter);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Activity & Focus Events</h1>
          <p className="page-subtitle">
            Complete audit trail of <span className="mono">FocusSession</span> records and{' '}
            <span className="mono">FocusEvent</span> productivity telemetry.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Focus Sessions History ({sessions.length})</div>
        {sessions.length === 0 ? (
          <div className="empty-state">No focus sessions recorded yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Room</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Points</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.title}</td>
                  <td>{s.roomName ? <span className="badge badge-indigo">{s.roomName}</span> : <span style={{ color: 'var(--text-muted)' }}>Solo</span>}</td>
                  <td>
                    {s.actualMinutes}m / {s.plannedMinutes}m
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        s.status === 'COMPLETED'
                          ? 'badge-teal'
                          : s.status === 'ACTIVE'
                            ? 'badge-indigo'
                            : s.status === 'PAUSED'
                              ? 'badge-amber'
                              : 'badge-muted'
                      }`}>
                      {s.status}
                    </span>
                  </td>
                  <td>{s.pointsEarned > 0 ? `+${s.pointsEarned}` : '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(s.startedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <span>Focus Event Log ({filteredEvents.length})</span>
          <div className="row-gap" style={{ flexWrap: 'wrap' }}>
            {['ALL', 'SESSION_COMPLETED', 'DISTRACTION_BLOCKED', 'ROOM_JOINED'].map((type) => (
              <button
                key={type}
                type="button"
                className={`preset-btn ${filter === type ? 'selected' : ''}`}
                onClick={() => setFilter(type)}>
                {type === 'ALL' ? 'All Events' : type.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="empty-state">No matching focus events.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Event Type</th>
                <th>Resource / Context</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((ev) => (
                <tr key={ev.id}>
                  <td>
                    <span className={`badge ${EVENT_BADGE[ev.eventType] || 'badge-muted'}`}>
                      {ev.eventType}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{ev.resourceLabel || '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(ev.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
