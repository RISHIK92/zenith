import { FormEvent, useState } from 'react';
import { Plus, Shield, ShieldAlert, Trash2 } from 'lucide-react';
import type { BlockedResource } from '../types';

type Props = {
  resources: BlockedResource[];
  onRefresh: () => Promise<void>;
};

const CATEGORIES = ['Social', 'Video', 'Gaming', 'News', 'Messaging', 'Other'];

export function BlockerView({ resources, onRefresh }: Props) {
  const [domainOrApp, setDomainOrApp] = useState('');
  const [category, setCategory] = useState('Social');
  const [testTarget, setTestTarget] = useState('');
  const [testResult, setTestResult] = useState<{ blocked: boolean; message: string } | null>(null);
  const [error, setError] = useState('');

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!domainOrApp.trim()) return;
    setError('');
    try {
      await window.zenithAPI.blocker.add({ domainOrApp: domainOrApp.trim(), category });
      setDomainOrApp('');
      await onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Could not add resource.');
    }
  };

  const handleToggle = async (r: BlockedResource) => {
    await window.zenithAPI.blocker.toggle({ id: r.id, isEnabled: !r.isEnabled });
    await onRefresh();
  };

  const handleRemove = async (id: string) => {
    await window.zenithAPI.blocker.remove(id);
    await onRefresh();
  };

  const handleTest = async (e: FormEvent) => {
    e.preventDefault();
    if (!testTarget.trim()) return;
    const res = await window.zenithAPI.blocker.check(testTarget.trim());
    if (res.blocked && res.resource) {
      setTestResult({
        blocked: true,
        message: `Blocked "${res.resource.domainOrApp}"! Logged DISTRACTION_BLOCKED event and awarded +5 pts.`,
      });
    } else {
      setTestResult({
        blocked: false,
        message: `"${testTarget.trim()}" is currently allowed.`,
      });
    }
    setTestTarget('');
    await onRefresh();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Distraction Blocker</h1>
          <p className="page-subtitle">
            Manage blocked websites and apps stored in <span className="mono">BlockedResource</span> with per-user{' '}
            <span className="mono">UNIQUE(user_id, domain_or_app)</span> integrity.
          </p>
        </div>
        <span className="badge badge-indigo">
          <Shield size={13} /> {resources.filter((r) => r.isEnabled).length} Active Rules
        </span>
      </div>

      {error && (
        <div className="error-box" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">Add Website or App to Blocklist</div>
          <form className="stack" onSubmit={handleAdd}>
            <div className="row-gap">
              <input
                className="input"
                value={domainOrApp}
                onChange={(e) => setDomainOrApp(e.target.value)}
                placeholder="e.g. tiktok.com, twitch.tv, discord"
                required
              />
              <select className="select" style={{ width: 150 }} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" type="submit">
              <Plus size={16} /> Add to Blocklist
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Test Blocker Rule</span>
            <ShieldAlert size={16} color="var(--rose)" />
          </div>
          <form className="stack" onSubmit={handleTest}>
            <div className="row-gap">
              <input
                className="input"
                value={testTarget}
                onChange={(e) => setTestTarget(e.target.value)}
                placeholder="Enter URL or app (e.g. https://youtube.com/shorts)"
              />
              <button className="btn btn-secondary" type="submit" style={{ flexShrink: 0 }}>
                Test Rule
              </button>
            </div>
            {testResult ? (
              <div
                style={{
                  padding: '9px 12px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  background: testResult.blocked ? 'var(--rose-soft)' : 'var(--teal-soft)',
                  color: testResult.blocked ? 'var(--rose)' : 'var(--teal)',
                }}>
                {testResult.message}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                Matching a blocked resource increments its block counter and emits a Main-to-Renderer IPC alert.
              </div>
            )}
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Blocked Resources ({resources.length})</div>
        {resources.length === 0 ? (
          <div className="empty-state">No blocked resources yet. Add distracting sites above.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Domain / App</th>
                <th>Category</th>
                <th>Times Blocked</th>
                <th>Enabled</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.domainOrApp}</td>
                  <td>
                    <span className="badge badge-muted">{r.category}</span>
                  </td>
                  <td>
                    <span className={`badge ${r.blockCount > 0 ? 'badge-rose' : 'badge-muted'}`}>
                      {r.blockCount} blocked
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`toggle ${r.isEnabled ? 'on' : ''}`}
                      onClick={() => handleToggle(r)}
                      aria-label={`Toggle ${r.domainOrApp}`}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-danger btn-sm" onClick={() => handleRemove(r.id)}>
                      <Trash2 size={14} /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
