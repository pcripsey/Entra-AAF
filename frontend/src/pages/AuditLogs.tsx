import React, { useState, useEffect } from 'react';
import { getAuditLogs } from '../services/api';
import { AuditLog } from '../types';

type FilterCategory = 'all' | 'auth' | 'failures' | 'admin' | 'system';

const FILTER_ACTIONS: Record<FilterCategory, string[]> = {
  all: [],
  auth: [
    'authentication_success', 'authentication_failure',
    'authorize_request', 'authorize_rejected',
    'token_issued', 'token_request_failed',
    'userinfo_failed',
  ],
  failures: [
    'authentication_failure', 'authorize_rejected', 'token_request_failed',
    'userinfo_failed', 'admin_login_failed', 'system_error',
  ],
  admin: [
    'admin_login', 'admin_login_failed', 'admin_logout',
    'entra_config_updated', 'aaf_config_updated', 'attribute_mappings_updated',
  ],
  system: ['system_error'],
};

const FAILURE_ACTIONS = new Set(FILTER_ACTIONS.failures);
const SUCCESS_ACTIONS = new Set([
  'authentication_success', 'authorize_request', 'token_issued', 'admin_login',
]);

function rowBackground(action: string): string {
  if (FAILURE_ACTIONS.has(action)) return '#fff5f5';
  if (SUCCESS_ACTIONS.has(action)) return '#f0fff4';
  return '#fff';
}

function badgeStyle(action: string): React.CSSProperties {
  const base: React.CSSProperties = { padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 };
  if (FAILURE_ACTIONS.has(action)) return { ...base, background: '#fde8e8', color: '#c0392b' };
  if (SUCCESS_ACTIONS.has(action)) return { ...base, background: '#d4edda', color: '#27ae60' };
  return { ...base, background: '#e8f0fe', color: '#1a73e8' };
}

function legendDotStyle(color: string): React.CSSProperties {
  return { display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: color, marginRight: '4px' };
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  h1: { fontSize: '24px', fontWeight: 'bold', color: '#1a1a2e' },
  card: { background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
  filterBar: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' },
  filterLabel: { fontSize: '13px', color: '#666', marginRight: '4px' },
  filterBtn: { padding: '5px 14px', border: '1px solid #ddd', borderRadius: '20px', cursor: 'pointer', background: '#fff', fontSize: '13px' },
  filterBtnActive: { background: '#0f3460', color: '#fff', border: '1px solid #0f3460', fontWeight: 600 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px', borderBottom: '2px solid #eee', fontSize: '12px', color: '#666', textTransform: 'uppercase' },
  td: { padding: '10px', borderBottom: '1px solid #eee', fontSize: '14px' },
  pagination: { display: 'flex', gap: '8px', marginTop: '16px', alignItems: 'center' },
  pageBtn: { padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: '#fff' },
  pageBtnActive: { background: '#0f3460', color: '#fff', border: '1px solid #0f3460' },
  legend: { display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '12px', color: '#666' },
};

const FILTER_LABELS: Record<FilterCategory, string> = {
  all: 'All',
  auth: 'Auth Events',
  failures: 'Failures Only',
  admin: 'Admin Actions',
  system: 'System Errors',
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<FilterCategory>('all');
  const limit = 20;

  const load = async (p: number, f: FilterCategory) => {
    const actions = FILTER_ACTIONS[f];
    const actionsParam = actions.length > 0 ? actions.join(',') : undefined;
    const res = await getAuditLogs(p, limit, actionsParam);
    const data = res.data as { logs: AuditLog[]; total: number };
    setLogs(data.logs);
    setTotal(data.total);
  };

  useEffect(() => { void load(page, filter); }, [page, filter]);

  const totalPages = Math.ceil(total / limit);

  const handleFilterChange = (f: FilterCategory) => {
    setFilter(f);
    setPage(1);
  };

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.h1}>User Access Log</h1>
        <span style={{ color: '#666' }}>{total} total entries</span>
      </div>
      <div style={styles.card}>
        <div style={styles.filterBar}>
          <span style={styles.filterLabel}>Filter:</span>
          {(Object.keys(FILTER_LABELS) as FilterCategory[]).map((f) => (
            <button
              key={f}
              style={{ ...styles.filterBtn, ...(filter === f ? styles.filterBtnActive : {}) }}
              onClick={() => handleFilterChange(f)}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <div style={styles.legend}>
          <span><span style={legendDotStyle('#27ae60')} />Success</span>
          <span><span style={legendDotStyle('#c0392b')} />Failure / Rejected</span>
          <span><span style={legendDotStyle('#1a73e8')} />Admin / Info</span>
        </div>
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
              <tr key={log.id} style={{ background: rowBackground(log.action) }}>
                <td style={styles.td}>{new Date(log.timestamp).toLocaleString()}</td>
                <td style={styles.td}><span style={badgeStyle(log.action)}>{log.action}</span></td>
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
