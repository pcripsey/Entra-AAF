import React from 'react';
import classNames from 'classnames';
import styles from './Badge.module.scss';

export type BadgeVariant = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export default function Badge({ variant = 'neutral', children, className, dot }: BadgeProps) {
  return (
    <span className={classNames(styles.badge, styles[variant], className)}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
