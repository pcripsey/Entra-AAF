import React from 'react';
import classNames from 'classnames';
import styles from './EmptyState.module.scss';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export default function EmptyState({
  title = 'No data',
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={classNames(styles.wrapper, className)} role="status">
      {icon && <div className={styles.icon} aria-hidden="true">{icon}</div>}
      <div className={styles.title}>{title}</div>
      {description && <div className={styles.description}>{description}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
