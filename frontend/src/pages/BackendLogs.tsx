import React, { useState, useEffect, useCallback } from 'react';
import { getBackendLogs } from '../services/api';
import { BackendLogEntry } from '../types';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import { BadgeVariant } from '../components/common/Badge';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Table from '../components/table/Table';
import { TableColumn } from '../components/table/Table';
import { format } from 'date-fns';
import styles from './BackendLogs.module.scss';

type LogType = 'app' | 'error';

function getLevelBadge(level: string): BadgeVariant {
  const l = level.toUpperCase();
  if (l === 'ERROR') return 'error';
  if (l === 'WARN') return 'warning';
  if (l === 'INFO') return 'success';
  return 'info';
}

function formatTimestamp(ts: string): string {
  if (!ts) return '—';
  try { return format(new Date(ts), 'MMM d, yyyy HH:mm:ss'); } catch { return ts; }
}

function formatMessage(message: string): React.ReactNode {
  // Try to detect and pretty-print JSON in [REQUEST] or [OUTBOUND] lines
  const tagMatch = /^(\[[\w]+\])\s+([\s\S]+)$/.exec(message);
  if (tagMatch) {
    const tag = tagMatch[1];
    const rest = tagMatch[2];
    try {
      const obj = JSON.parse(rest) as Record<string, unknown>;
      return (
        <span>
          <span className={styles.logTag}>{tag}</span>{' '}
          <span className={styles.logJson}>{JSON.stringify(obj)}</span>
        </span>
      );
    } catch {
      // not JSON, fall through
    }
    return (
      <span>
        <span className={styles.logTag}>{tag}</span>{' '}
        {rest}
      </span>
    );
  }
  return message;
}

const columns: TableColumn<BackendLogEntry>[] = [
  {
    key: 'timestamp',
    header: 'Timestamp',
    sortable: true,
    render: (entry) => formatTimestamp(entry.timestamp),
    width: 190,
  },
  {
    key: 'level',
    header: 'Level',
    render: (entry) => (
      <Badge variant={getLevelBadge(entry.level)}>{entry.level}</Badge>
    ),
    width: 80,
  },
  {
    key: 'message',
    header: 'Message',
    render: (entry) => (
      <span className={styles.messageCell}>{formatMessage(entry.message)}</span>
    ),
  },
];

export default function BackendLogs() {
  const [logs, setLogs] = useState<BackendLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [logType, setLogType] = useState<LogType>('app');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const limit = 100;

  const load = useCallback(async (p: number, type: LogType, d: string, s: string) => {
    setLoading(true);
    try {
      const res = await getBackendLogs({ type, date: d, page: p, limit, search: s });
      const data = res.data as { logs: BackendLogEntry[]; total: number };
      setLogs(data.logs);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(page, logType, date, search); }, [page, logType, date, search, load]);

  const handleTypeChange = (type: LogType) => {
    setLogType(type);
    setPage(1);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDate(e.target.value);
    setPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Backend Logs</h1>
          <p className={styles.pageSubtitle}>{total} entries</p>
        </div>
      </div>

      <Card>
        <Card.Header>
          <div className={styles.filterBar}>
            <div className={styles.filterGroup} role="group" aria-label="Log type">
              <span className={styles.filterLabel}>Type:</span>
              <Button
                variant={logType === 'app' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => handleTypeChange('app')}
                aria-pressed={logType === 'app'}
              >
                App Logs
              </Button>
              <Button
                variant={logType === 'error' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => handleTypeChange('error')}
                aria-pressed={logType === 'error'}
              >
                Error Logs
              </Button>
            </div>

            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Date:</span>
              <Input
                type="date"
                value={date}
                onChange={handleDateChange}
                aria-label="Log date"
                className={styles.dateInput}
              />
            </div>

            <form className={styles.filterGroup} onSubmit={handleSearchSubmit}>
              <span className={styles.filterLabel}>Search:</span>
              <Input
                type="text"
                placeholder="Filter log entries…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Search log entries"
                className={styles.searchInput}
              />
              <Button type="submit" variant="secondary" size="sm">Search</Button>
              {search && (
                <Button type="button" variant="secondary" size="sm" onClick={handleClearSearch}>
                  Clear
                </Button>
              )}
            </form>
          </div>
        </Card.Header>
        <Card.Body>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.info}`} aria-hidden="true" />
              INFO
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.warning}`} aria-hidden="true" />
              WARN
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.error}`} aria-hidden="true" />
              ERROR
            </span>
          </div>

          <Table<BackendLogEntry>
            columns={columns}
            data={logs}
            rowKey={(entry) => entry.id}
            loading={loading}
            emptyMessage="No log entries found for this date"
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
