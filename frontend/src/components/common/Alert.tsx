import React from 'react';
import classNames from 'classnames';
import styles from './Alert.module.scss';

export type AlertVariant = 'success' | 'warning' | 'error' | 'info';

interface AlertProps {
  variant: AlertVariant;
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
  title?: string;
}

const ICONS: Record<AlertVariant, string> = {
  success: '✓',
  warning: '⚠',
  error: '✕',
  info: 'ℹ',
};

export default function Alert({ variant, children, className, onClose, title }: AlertProps) {
  return (
    <div
      className={classNames(styles.alert, styles[variant], className)}
      role="alert"
      aria-live="polite"
    >
      <span className={styles.icon} aria-hidden="true">{ICONS[variant]}</span>
      <div className={styles.content}>
        {title && <div className={styles.title}>{title}</div>}
        <div>{children}</div>
      </div>
      {onClose && (
        <button
          className={styles.close}
          onClick={onClose}
          aria-label="Dismiss alert"
          type="button"
        >
          ×
        </button>
      )}
    </div>
  );
}
