import React, { useState, useMemo } from 'react';
import classNames from 'classnames';
import styles from './Table.module.scss';
import LoadingSpinner from '../common/LoadingSpinner';
import EmptyState from '../common/EmptyState';

export type SortDirection = 'asc' | 'desc';

export interface TableColumn<T> {
  key: string;
  header: React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: T) => void;
  sortColumn?: string;
  sortDirection?: SortDirection;
  onSort?: (column: string, direction: SortDirection) => void;
  // Pagination
  page?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  stickyHeader?: boolean;
}

export default function Table<T>({
  columns,
  data,
  rowKey,
  loading,
  emptyMessage = 'No records found',
  className,
  onRowClick,
  sortColumn,
  sortDirection,
  onSort,
  page,
  pageSize,
  totalCount,
  onPageChange,
  stickyHeader,
}: TableProps<T>) {
  const [internalSort, setInternalSort] = useState<{ column: string; direction: SortDirection } | null>(null);

  const activeSort = sortColumn ? { column: sortColumn, direction: sortDirection ?? 'asc' } : internalSort;

  const handleSort = (col: TableColumn<T>) => {
    if (!col.sortable) return;
    const newDir: SortDirection = activeSort?.column === col.key && activeSort.direction === 'asc' ? 'desc' : 'asc';
    if (onSort) {
      onSort(col.key, newDir);
    } else {
      setInternalSort({ column: col.key, direction: newDir });
    }
  };

  const sortedData = useMemo(() => {
    if (!activeSort || onSort) return data;
    const col = columns.find((c) => c.key === activeSort.column);
    if (!col) return data;
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[activeSort.column];
      const bv = (b as Record<string, unknown>)[activeSort.column];
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      return activeSort.direction === 'asc' ? cmp : -cmp;
    });
  }, [data, activeSort, columns, onSort]);

  const totalPages = pageSize && totalCount ? Math.ceil(totalCount / pageSize) : undefined;

  return (
    <div className={classNames(styles.wrapper, className)}>
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead className={classNames(styles.thead, { [styles.sticky]: stickyHeader })}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={classNames(
                    styles.th,
                    styles[`align-${col.align ?? 'left'}`],
                    { [styles.sortable]: col.sortable },
                  )}
                  style={{ width: col.width }}
                  onClick={() => handleSort(col)}
                  aria-sort={
                    activeSort?.column === col.key
                      ? activeSort.direction === 'asc' ? 'ascending' : 'descending'
                      : undefined
                  }
                >
                  <span className={styles.thContent}>
                    {col.header}
                    {col.sortable && (
                      <span className={styles.sortIcon} aria-hidden="true">
                        {activeSort?.column === col.key
                          ? activeSort.direction === 'asc' ? ' ↑' : ' ↓'
                          : ' ↕'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className={styles.tdCenter}>
                  <LoadingSpinner size="sm" />
                </td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.tdCenter}>
                  <EmptyState title={emptyMessage} />
                </td>
              </tr>
            ) : (
              sortedData.map((row, i) => (
                <tr
                  key={rowKey(row)}
                  className={classNames(styles.tr, { [styles.clickable]: !!onRowClick })}
                  onClick={() => onRowClick?.(row)}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={classNames(styles.td, styles[`align-${col.align ?? 'left'}`])}
                    >
                      {col.render
                        ? col.render(row, i)
                        : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages !== undefined && totalPages > 1 && page !== undefined && onPageChange && (
        <div className={styles.pagination}>
          <span className={styles.pageInfo}>
            Page {page} of {totalPages}
            {totalCount !== undefined && ` (${totalCount} total)`}
          </span>
          <div className={styles.pageControls}>
            <button
              className={styles.pageBtn}
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              aria-label="Previous page"
            >
              ‹ Prev
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) {
                p = i + 1;
              } else if (page <= 3) {
                p = i + 1;
              } else if (page >= totalPages - 2) {
                p = totalPages - 4 + i;
              } else {
                p = page - 2 + i;
              }
              return (
                <button
                  key={p}
                  className={classNames(styles.pageBtn, { [styles.active]: p === page })}
                  onClick={() => onPageChange(p)}
                  aria-label={`Page ${p}`}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </button>
              );
            })}
            <button
              className={styles.pageBtn}
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              aria-label="Next page"
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
