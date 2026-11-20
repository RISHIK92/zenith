import { FormEvent, useState } from 'react';
import { Hash, LogIn, LogOut, Play, Plus, Radio, Users } from 'lucide-react';
import type { Room, SyncStatus } from '../types';

type Props = {
  rooms: Room[];
  syncStatus: SyncStatus | null;
  onRefresh: () => Promise<void>;
  onStartFocusInRoom: (roomId: string) => void;
};

export function RoomsView({ rooms, syncStatus, onRefresh, onStartFocusInRoom }: Props) {
  const [joinCode, setJoinCode] = useState('');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('Study');
  const [description, setDescription] = useState('');
  const [syncUrl, setSyncUrl] = useState(syncStatus?.url || 'http://127.0.0.1:4123');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSyncConnect = async (e: FormEvent) => {
    e.preventDefault();
    await window.zenithAPI.sync.configure(syncUrl.trim());
    setTimeout(() => onRefresh().catch(() => {}), 400);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    setCreating(true);
    try {
      await window.zenithAPI.rooms.create({ name, topic, description });
      setName('');
      setDescription('');
      await onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Could not create room.');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinByCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setError('');
    try {
      await window.zenithAPI.rooms.join({ code: joinCode.trim() });
      setJoinCode('');
      await onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Room code not found.');
    }
  };

  const handleJoin = async (roomId: string) => {
    setError('');
    try {
      await window.zenithAPI.rooms.join({ roomId });
      await onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Could not join room.');
    }
  };

  const handleLeave = async (roomId: string) => {
    await window.zenithAPI.rooms.leave(roomId);
    await onRefresh();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Collaborative Focus Rooms</h1>
          <p className="page-subtitle">
            Stay accountable with peers using shared rooms backed by <span className="mono">Room</span> &{' '}
            <span className="mono">RoomParticipant</span> tables.
          </p>
        </div>
        <form className="row-gap" onSubmit={handleJoinByCode}>
          <input
            className="input"
            style={{ width: 180 }}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Code (e.g. ZEN-STUDY)"
          />
          <button className="btn btn-secondary" type="submit">
            <Hash size={15} /> Join Code
          </button>
        </form>
      </div>

      {error && (
        <div className="error-box" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="row-gap">
            <Radio size={16} color={syncStatus?.connected ? 'var(--teal)' : 'var(--text-muted)'} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Multi-Device Room Sync</span>
            <span className={`badge ${syncStatus?.connected ? 'badge-teal' : 'badge-muted'}`}>
              {syncStatus?.connected ? 'Live Sync Connected (SSE)' : 'Local SQLite Mode'}
            </span>
          </div>
          <form className="row-gap" onSubmit={handleSyncConnect}>
            <input
              className="input mono"
              style={{ width: 230, padding: '6px 10px' }}
              value={syncUrl}
              onChange={(e) => setSyncUrl(e.target.value)}
              placeholder="http://127.0.0.1:4123"
            />
            <button className="btn btn-secondary btn-sm" type="submit">
              Connect
            </button>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Create a New Focus Room</div>
        <form className="grid-4" style={{ marginBottom: 0, alignItems: 'end' }} onSubmit={handleCreate}>
          <div className="field">
            <label className="label">Room Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Finals Week Sprint"
              required
            />
          </div>
          <div className="field">
            <label className="label">Topic</label>
            <select className="select" value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="Study">Study</option>
              <option value="Engineering">Engineering</option>
              <option value="Writing">Writing</option>
              <option value="Research">Research</option>
              <option value="Design">Design</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Description</label>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Quiet 50/10 focus blocks"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={creating} style={{ height: 41 }}>
            <Plus size={16} /> Create Room
          </button>
        </form>
      </div>

      <div className="grid-2">
        {rooms.map((room) => (
          <div key={room.id} className="card stack">
            <div className="row-between">
              <div>
                <div className="row-gap">
                  <h3 style={{ fontSize: 16, fontWeight: 700 }}>{room.name}</h3>
                  <span className="badge badge-indigo">{room.topic}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
                  Hosted by {room.hostName} · Code: <strong className="mono">{room.code}</strong>
                </div>
              </div>
              <span className="badge badge-muted">
                <Users size={12} /> {room.participantCount}/{room.maxParticipants}
              </span>
            </div>

            {room.description && (
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{room.description}</p>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {room.participants.map((p) => (
                <span key={p.id} className="badge badge-teal">
                  {p.displayName} {p.role === 'HOST' ? '(Host)' : ''}
                </span>
              ))}
            </div>

            <div className="row-between" style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              {room.isJoined ? (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => onStartFocusInRoom(room.id)}>
                    <Play size={14} /> Focus in Room
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleLeave(room.id)}>
                    <LogOut size={14} /> Leave
                  </button>
                </>
              ) : (
                <button className="btn btn-secondary btn-sm" onClick={() => handleJoin(room.id)}>
                  <LogIn size={14} /> Join Room
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
