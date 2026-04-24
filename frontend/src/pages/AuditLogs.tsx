import React, { useState, useEffect } from 'react';
import { getAuditLogs } from '../services/api';
import { AuditLog } from '../types';

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  h1: { fontSize: '24px', fontWeight: 'bold', color: '#1a1a2e' },
  card: { background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px', borderBottom: '2px solid #eee', fontSize: '12px', color: '#666', textTransform: 'uppercase' },
  td: { padding: '10px', borderBottom: '1px solid #eee', fontSize: '14px' },
  pagination: { display: 'flex', gap: '8px', marginTop: '16px', alignItems: 'center' },
  pageBtn: { padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: '#fff' },
  pageBtnActive: { background: '#0f3460', color: '#fff', border: '1px solid #0f3460' },
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const load = async (p: number) => {
    const res = await getAuditLogs(p, limit);
    const data = res.data as { logs: AuditLog[]; total: number };
    setLogs(data.logs);
    setTotal(data.total);
  };

  useEffect(() => { void load(page); }, [page]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.h1}>Audit Logs</h1>
        <span style={{ color: '#666' }}>{total} total entries</span>
      </div>
      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Timestamp</th>
              <th style={styles.th}>Action</th>
              <th style={styles.th}>User</th>
              <th style={styles.th}>IP Address</th>
              <th style={styles.th}>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td style={styles.td} colSpan={5}>No logs found</td></tr>
            ) : logs.map((log) => (
              <tr key={log.id}>
                <td style={styles.td}>{new Date(log.timestamp).toLocaleString()}</td>
                <td style={styles.td}><code>{log.action}</code></td>
                <td style={styles.td}>{log.user || '-'}</td>
                <td style={styles.td}>{log.ip_address || '-'}</td>
                <td style={styles.td}>{log.details || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div style={styles.pagination}>
            <button style={styles.pageBtn} onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>Prev</button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
              <button key={p} style={{ ...styles.pageBtn, ...(p === page ? styles.pageBtnActive : {}) }} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button style={styles.pageBtn} onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
