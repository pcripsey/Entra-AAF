import React, { useState, useEffect } from 'react';
import { getAuditLogs } from '../services/api';
import { AuditLog } from '../types';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import { BadgeVariant } from '../components/common/Badge';
import Button from '../components/common/Button';
import Table from '../components/table/Table';
import { TableColumn } from '../components/table/Table';
import { format } from 'date-fns';
import styles from './AuditLogs.module.scss';

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

function getActionBadge(action: string): BadgeVariant {
  if (FAILURE_ACTIONS.has(action)) return 'error';
  if (SUCCESS_ACTIONS.has(action)) return 'success';
  return 'info';
}

const FILTER_LABELS: Record<FilterCategory, string> = {
  all: 'All Events',
  auth: 'Auth Events',
  failures: 'Failures',
  admin: 'Admin Actions',
  system: 'System Errors',
};

const columns: TableColumn<AuditLog>[] = [
  {
    key: 'timestamp',
    header: 'Timestamp',
    sortable: true,
    render: (log) => {
      try { return format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss'); } catch { return log.timestamp; }
    },
    width: 190,
  },
  {
    key: 'action',
    header: 'Action',
    render: (log) => (
      <Badge variant={getActionBadge(log.action)}>{log.action}</Badge>
    ),
  },
  {
    key: 'user',
    header: 'User',
    sortable: true,
    render: (log) => log.user ?? '—',
  },
  {
    key: 'ip_address',
    header: 'IP Address',
    render: (log) => log.ip_address ?? '—',
  },
  {
    key: 'details',
    header: 'Details',
    render: (log) => log.details
      ? <span className={styles.details} title={log.details}>{log.details}</span>
      : '—',
  },
];

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const load = async (p: number, f: FilterCategory) => {
    setLoading(true);
    try {
      const actions = FILTER_ACTIONS[f];
      const actionsParam = actions.length > 0 ? actions.join(',') : undefined;
      const res = await getAuditLogs(p, limit, actionsParam);
      const data = res.data as { logs: AuditLog[]; total: number };
      setLogs(data.logs);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(page, filter); }, [page, filter]);

  const handleFilterChange = (f: FilterCategory) => {
    setFilter(f);
    setPage(1);
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>User Access Log</h1>
          <p className={styles.pageSubtitle}>{total} total entries</p>
        </div>
      </div>

      <Card>
        <Card.Header>
          <div className={styles.filterBar} role="group" aria-label="Filter audit logs">
            <span className={styles.filterLabel}>Filter:</span>
            {(Object.keys(FILTER_LABELS) as FilterCategory[]).map((f) => (
              <Button
                key={f}
                variant={filter === f ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => handleFilterChange(f)}
                aria-pressed={filter === f}
              >
                {FILTER_LABELS[f]}
              </Button>
            ))}
          </div>
        </Card.Header>
        <Card.Body>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.success}`} aria-hidden="true" />
              Success
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.failure}`} aria-hidden="true" />
              Failure / Rejected
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.info}`} aria-hidden="true" />
              Admin / Info
            </span>
          </div>

          <Table<AuditLog>
            columns={columns}
            data={logs}
            rowKey={(log) => log.id}
            loading={loading}
            emptyMessage="No logs found for this filter"
            page={page}
            pageSize={limit}
            totalCount={total}
            onPageChange={setPage}
          />
        </Card.Body>
      </Card>
    </div>
  );
}
