import React, { useState, useEffect } from 'react';
import { getSessions } from '../services/api';
import { Session } from '../types';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import { BadgeVariant } from '../components/common/Badge';
import Table from '../components/table/Table';
import { TableColumn } from '../components/table/Table';
import { format } from 'date-fns';
import styles from './Sessions.module.scss';

function getStatusBadge(status: string): BadgeVariant {
  if (status === 'authenticated') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'expired') return 'error';
  return 'neutral';
}

const columns: TableColumn<Session>[] = [
  {
    key: 'id',
    header: 'Session ID',
    render: (s) => (
      <code title={s.id} className={styles.code}>{s.id.substring(0, 12)}…</code>
    ),
  },
  {
    key: 'user',
    header: 'User',
    sortable: true,
  },
  {
    key: 'email',
    header: 'Email (Entra)',
    render: (s) => s.email ?? '—',
  },
  {
    key: 'sub',
    header: 'Subject (OID)',
    render: (s) => s.sub
      ? <code title={s.sub} className={styles.code}>{s.sub.substring(0, 12)}…</code>
      : '—',
  },
  {
    key: 'created_at',
    header: 'Created',
    sortable: true,
    render: (s) => {
      try { return format(new Date(s.created_at), 'MMM d, HH:mm'); } catch { return s.created_at; }
    },
  },
  {
    key: 'expires_at',
    header: 'Expires',
    render: (s) => {
      try { return format(new Date(s.expires_at), 'MMM d, HH:mm'); } catch { return s.expires_at; }
    },
  },
  {
    key: 'status',
    header: 'Status',
    render: (s) => (
      <Badge variant={getStatusBadge(s.status)} dot>{s.status}</Badge>
    ),
  },
];

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
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Active Sessions</h1>
          <p className={styles.pageSubtitle}>
            {loading ? 'Loading…' : `${sessions.length} session${sessions.length !== 1 ? 's' : ''} found`}
          </p>
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

      <Card>
        <Card.Body>
          <Table<Session>
            columns={columns}
            data={sessions}
            rowKey={(s) => s.id}
            loading={loading}
            emptyMessage="No active sessions"
            stickyHeader
          />
        </Card.Body>
      </Card>
    </div>
  );
}
