import React, { useState, useEffect } from 'react';
import { getStatus, getAuditLogs } from '../services/api';
import { SystemStatus, AuditLog } from '../types';

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  h1: { fontSize: '24px', fontWeight: 'bold', color: '#1a1a2e' },
  refreshBtn: { padding: '8px 16px', background: '#0f3460', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' },
  card: { background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
  cardTitle: { fontSize: '12px', color: '#666', textTransform: 'uppercase', marginBottom: '8px' },
  cardValue: { fontSize: '28px', fontWeight: 'bold', color: '#1a1a2e' },
  statusOk: { color: '#27ae60' },
  statusErr: { color: '#c0392b' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px', borderBottom: '2px solid #eee', fontSize: '12px', color: '#666', textTransform: 'uppercase' },
  td: { padding: '10px', borderBottom: '1px solid #eee', fontSize: '14px' },
};

export default function Dashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [statusRes, logsRes] = await Promise.all([getStatus(), getAuditLogs(1, 5)]);
      setStatus(statusRes.data as SystemStatus);
      setLogs((logsRes.data as { logs: AuditLog[] }).logs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.h1}>Dashboard</h1>
        <button style={styles.refreshBtn} onClick={() => void load()}>Refresh</button>
      </div>

      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>System Status</div>
          <div style={{ ...styles.cardValue, ...(status?.status === 'healthy' ? styles.statusOk : styles.statusErr) }}>
            {loading ? '...' : status?.status || 'unknown'}
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Uptime (s)</div>
          <div style={styles.cardValue}>{status?.uptime ?? '...'}</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Entra ID</div>
          <div style={{ ...styles.cardValue, ...(status?.entraConfigured ? styles.statusOk : styles.statusErr) }}>
            {status?.entraConfigured ? 'Configured' : 'Not Set'}
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>AAF</div>
          <div style={{ ...styles.cardValue, ...(status?.aafConfigured ? styles.statusOk : styles.statusErr) }}>
            {status?.aafConfigured ? 'Configured' : 'Not Set'}
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>Recent Audit Logs</h2>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Timestamp</th>
              <th style={styles.th}>Action</th>
              <th style={styles.th}>User</th>
              <th style={styles.th}>IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td style={styles.td}>{new Date(log.timestamp).toLocaleString()}</td>
                <td style={styles.td}>{log.action}</td>
                <td style={styles.td}>{log.user || '-'}</td>
                <td style={styles.td}>{log.ip_address || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
