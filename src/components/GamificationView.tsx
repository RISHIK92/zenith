import { Award, Flame, Shield, Sparkles, Trophy, Users, Zap } from 'lucide-react';
import type { GamificationData } from '../types';

type Props = {
  data: GamificationData | null;
};

function renderIcon(name: string, unlocked: boolean) {
  const color = unlocked ? '#D97706' : '#94A3B8';
  switch (name) {
    case 'flame':
      return <Flame size={20} color={color} />;
    case 'shield':
      return <Shield size={20} color={color} />;
    case 'users':
      return <Users size={20} color={color} />;
    case 'trophy':
      return <Trophy size={20} color={color} />;
    case 'zap':
      return <Zap size={20} color={color} />;
    default:
      return <Sparkles size={20} color={color} />;
  }
}

export function GamificationView({ data }: Props) {
  if (!data) return <div className="empty-state">Loading achievements...</div>;

  const unlockedCount = data.achievements.filter((a) => a.unlocked).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Achievements & Points Ledger</h1>
          <p className="page-subtitle">
            Earn points from focus sessions and resisting distractions, tracked in{' '}
            <span className="mono">Achievement</span>, <span className="mono">UserAchievement</span>, and{' '}
            <span className="mono">PointTransaction</span>.
          </p>
        </div>
        <div className="row-gap">
          <span className="badge badge-amber">
            <Trophy size={13} /> {data.stats.points} pts
          </span>
          <span className="badge badge-indigo">
            <Award size={13} /> {unlockedCount}/{data.achievements.length} Unlocked
          </span>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 22 }}>
        {data.achievements.map((a) => {
          const pct = Math.min(100, Math.round((a.currentValue / Math.max(1, a.criteriaValue)) * 100));
          return (
            <div
              key={a.id}
              className="card"
              style={{
                borderColor: a.unlocked ? '#FCD34D' : 'var(--border)',
                background: a.unlocked ? '#FFFDF5' : 'var(--surface)',
              }}>
              <div className="row-between" style={{ marginBottom: 10 }}>
                <div
                  className="stat-icon"
                  style={{ background: a.unlocked ? 'var(--amber-soft)' : 'var(--surface-muted)' }}>
                  {renderIcon(a.icon, a.unlocked)}
                </div>
                <span className={`badge ${a.unlocked ? 'badge-amber' : 'badge-muted'}`}>
                  +{a.pointsReward} pts
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{a.title}</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{a.description}</p>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${pct}%`,
                    background: a.unlocked ? '#D97706' : 'var(--primary)',
                  }}
                />
              </div>
              <div className="row-between" style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>
                  {Math.min(a.currentValue, a.criteriaValue)} / {a.criteriaValue}
                </span>
                <span>{a.unlocked ? 'Unlocked' : `${pct}%`}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-title">Point Transaction Records ({data.transactions.length})</div>
        {data.transactions.length === 0 ? (
          <div className="empty-state">No point transactions yet. Complete a focus session to earn points!</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Reason</th>
                <th>Change</th>
                <th>Balance After</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 500 }}>{t.reason}</td>
                  <td>
                    <span className={`badge ${t.delta >= 0 ? 'badge-teal' : 'badge-rose'}`}>
                      {t.delta >= 0 ? `+${t.delta}` : t.delta} pts
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{t.balanceAfter} pts</td>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
