import React, { useState, useEffect } from 'react';
import { getSessions } from '../services/api';
import { Session } from '../types';

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  h1: { fontSize: '24px', fontWeight: 'bold', color: '#1a1a2e' },
  refreshBtn: { padding: '8px 16px', background: '#0f3460', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  card: { background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px', borderBottom: '2px solid #eee', fontSize: '12px', color: '#666', textTransform: 'uppercase' },
  td: { padding: '10px', borderBottom: '1px solid #eee', fontSize: '14px' },
  badge: { padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '500' },
};

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getSessions();
      setSessions(res.data as Session[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.h1}>Active Sessions</h1>
        <button style={styles.refreshBtn} onClick={() => void load()}>Refresh</button>
      </div>
      <div style={styles.card}>
        {loading ? <p>Loading...</p> : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Session ID</th>
                <th style={styles.th}>User</th>
                <th style={styles.th}>Email (Entra ID)</th>
                <th style={styles.th}>Subject (oid)</th>
                <th style={styles.th}>Created</th>
                <th style={styles.th}>Expires</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td style={styles.td} colSpan={7}>No active sessions</td></tr>
              ) : sessions.map((s) => (
                <tr key={s.id}>
                  <td style={styles.td}><code>{s.id.substring(0, 8)}...</code></td>
                  <td style={styles.td}>{s.user}</td>
                  <td style={styles.td}>{s.email || 'N/A'}</td>
                  <td style={styles.td}>{s.sub ? <code title={s.sub} aria-label={`Subject: ${s.sub}`}>{s.sub.substring(0, 12)}...</code> : 'N/A'}</td>
                  <td style={styles.td}>{new Date(s.created_at).toLocaleString()}</td>
                  <td style={styles.td}>{new Date(s.expires_at).toLocaleString()}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, background: s.status === 'authenticated' ? '#eaffea' : '#fff3cd', color: s.status === 'authenticated' ? '#27ae60' : '#856404' }}>
                      {s.status}
                    </span>
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
