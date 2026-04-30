import React, { useState, useEffect } from 'react';
import { getStatus, getAuditLogs } from '../services/api';
import { SystemStatus, AuditLog } from '../types';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import { BadgeVariant } from '../components/common/Badge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import Table from '../components/table/Table';
import { TableColumn } from '../components/table/Table';
import { format } from 'date-fns';
import styles from './Dashboard.module.scss';

interface StatCardProps {
  title: string;
  value: string | number;
  status?: 'ok' | 'error' | 'neutral';
}

function StatCard({ title, value, status = 'neutral' }: StatCardProps) {
  const badgeMap: Record<string, BadgeVariant> = { ok: 'success', error: 'error', neutral: 'neutral' };
  return (
    <div className={styles.statCard}>
      <div className={styles.statTitle}>{title}</div>
      <div className={`${styles.statValue} ${styles[status]}`}>{value}</div>
      <Badge variant={badgeMap[status]} dot className={styles.statBadge}>
        {status === 'ok' ? 'Active' : status === 'error' ? 'Inactive' : 'Unknown'}
      </Badge>
    </div>
  );
}

const logColumns: TableColumn<AuditLog>[] = [
  {
    key: 'timestamp',
    header: 'Timestamp',
    render: (log) => {
      try { return format(new Date(log.timestamp), 'MMM d, HH:mm:ss'); } catch { return log.timestamp; }
    },
  },
  {
    key: 'action',
    header: 'Action',
    render: (log) => {
      const isFailure = log.action.includes('fail') || log.action.includes('reject') || log.action.includes('error');
      const isSuccess = log.action.includes('success') || log.action.includes('issued') || log.action === 'admin_login';
      const variant: BadgeVariant = isFailure ? 'error' : isSuccess ? 'success' : 'info';
      return <Badge variant={variant}>{log.action}</Badge>;
    },
  },
  {
    key: 'user',
    header: 'User',
    render: (log) => log.user ?? '—',
  },
  {
    key: 'ip_address',
    header: 'IP Address',
    render: (log) => log.ip_address ?? '—',
  },
];

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

  const uptimeFormatted = status?.uptime
    ? `${Math.floor(status.uptime / 3600)}h ${Math.floor((status.uptime % 3600) / 60)}m`
    : '—';

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Dashboard</h1>
          <p className={styles.pageSubtitle}>System overview and recent activity</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void load()}
          leftIcon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          }
        >
          Refresh
        </Button>
      </div>

      {/* Status Cards */}
      {loading ? (
        <LoadingSpinner label="Loading system status…" />
      ) : (
        <div className={styles.statsGrid}>
          <StatCard
            title="System Status"
            value={status?.status ?? 'unknown'}
            status={status?.status === 'healthy' ? 'ok' : 'error'}
          />
          <StatCard title="Uptime" value={uptimeFormatted} status="ok" />
          <StatCard
            title="Entra ID"
            value={status?.entraConfigured ? 'Configured' : 'Not Set'}
            status={status?.entraConfigured ? 'ok' : 'error'}
          />
          <StatCard
            title="AAF"
            value={status?.aafConfigured ? 'Configured' : 'Not Set'}
            status={status?.aafConfigured ? 'ok' : 'error'}
          />
          <StatCard
            title="Step-Up MFA"
            value={status?.stepUpConfigured ? 'Enabled' : 'Disabled'}
            status={status?.stepUpConfigured ? 'ok' : 'neutral'}
          />
          <StatCard title="Version" value={status?.version ?? '—'} status="neutral" />
        </div>
      )}

      {/* Recent Logs */}
      <Card>
        <Card.Header
          actions={
            <Button variant="ghost" size="sm" onClick={() => window.location.href = '/audit-logs'}>
              View All →
            </Button>
          }
        >
          <h2 className={styles.sectionTitle}>Recent Audit Events</h2>
        </Card.Header>
        <Card.Body>
          <Table<AuditLog>
            columns={logColumns}
            data={logs}
            rowKey={(log) => log.id}
            loading={loading}
            emptyMessage="No recent audit events"
          />
        </Card.Body>
      </Card>
    </div>
  );
}
