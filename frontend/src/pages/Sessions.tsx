import React, { useState, useEffect, useRef } from 'react';
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

const FAST_POLL_MS = 4000;
const IDLE_POLL_MS = 30000;

function getStatusBadge(status: string): BadgeVariant {
  if (status === 'authenticated') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'expired') return 'error';
  return 'neutral';
}

function getStepUpBadge(stepUpStatus: string): { variant: BadgeVariant; label: string } {
  switch (stepUpStatus) {
    case 'completed':
      return { variant: 'success', label: 'MFA ✓' };
    case 'pending_mfa':
      return { variant: 'warning', label: 'Awaiting MFA' };
    case 'pending_entra':
    default:
      return { variant: 'neutral', label: 'Awaiting Entra' };
  }
}

function formatElapsed(createdAt: string): string {
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const totalSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function parseRequestedClaimsAcr(raw: string | null): string {
  if (!raw) return '—';
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const idToken = parsed['id_token'] as Record<string, unknown> | undefined;
    if (idToken) {
      const acr = idToken['acr'] as Record<string, unknown> | string | undefined;
      if (typeof acr === 'string') return acr;
      if (acr && typeof acr === 'object') {
        const val = (acr as Record<string, unknown>)['value'];
        if (typeof val === 'string') return val;
      }
    }
  } catch {
    // fall through
  }
  return '—';
}

function ElapsedCell({ createdAt, tick }: { createdAt: string; tick: number }) {
  // tick is a counter from the parent that increments every second — drives re-render
  void tick;
  return <span className={styles.elapsed}>{formatElapsed(createdAt)}</span>;
}

function buildColumns(tick: number): TableColumn<Session>[] {
  return [
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
    header: 'Auth Status',
    render: (s) => (
      <Badge variant={getStatusBadge(s.status)} dot>{s.status}</Badge>
    ),
  },
  {
    key: 'step_up_status',
    header: 'Step-Up',
    render: (s) => {
      const { variant, label } = getStepUpBadge(s.step_up_status);
      const isPending = s.step_up_status === 'pending_entra' || s.step_up_status === 'pending_mfa';
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Badge variant={variant} dot>{label}</Badge>
          {isPending && <ElapsedCell createdAt={s.created_at} tick={tick} />}
        </span>
      );
    },
  },
  {
    key: 'requested_claims',
    header: 'Requested Claims',
    render: (s) => parseRequestedClaimsAcr(s.requested_claims ?? null),
  },
  ];
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadRef = useRef<() => Promise<void>>();

  const hasPending = sessions.some(
    (s) => s.step_up_status === 'pending_entra' || s.step_up_status === 'pending_mfa',
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await getSessions();
      setSessions(res.data as Session[]);
    } finally {
      setLoading(false);
    }
  };

  // Keep ref up-to-date so interval always calls the latest load
  loadRef.current = load;

  // Bootstrap on mount
  useEffect(() => { void load(); }, []);

  // Single 1-second tick for elapsed timers — only active when pending sessions exist
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasPending]);

  // Live polling — reschedule whenever hasPending changes
  useEffect(() => {
    const interval = hasPending ? FAST_POLL_MS : IDLE_POLL_MS;

    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => { void loadRef.current?.(); }, interval);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasPending]);

  const columns = buildColumns(tick);

  const completed = sessions.filter((s) => s.step_up_status === 'completed').length;
  const pendingMfa = sessions.filter((s) => s.step_up_status === 'pending_mfa').length;
  const pendingEntra = sessions.filter((s) => s.step_up_status === 'pending_entra').length;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div>
            <h1 className={styles.pageTitle}>Active Sessions</h1>
            <p className={styles.pageSubtitle}>
              {loading ? 'Loading…' : `${sessions.length} session${sessions.length !== 1 ? 's' : ''} found`}
            </p>
          </div>
          {hasPending && <span className={styles.liveBadge} title="Live — polling every 4s" />}
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

      {!loading && sessions.length > 0 && (
        <div className={styles.stepUpSummary}>
          <Badge variant="success" dot>Step-up complete: {completed}</Badge>
          <Badge variant="warning" dot>Awaiting MFA: {pendingMfa}</Badge>
          <Badge variant="neutral" dot>Awaiting Entra: {pendingEntra}</Badge>
        </div>
      )}

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
