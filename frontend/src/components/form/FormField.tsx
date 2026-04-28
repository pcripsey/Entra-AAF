import React from 'react';
import classNames from 'classnames';
import styles from './FormField.module.scss';

interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export default function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={classNames(styles.field, className)}>
      {label && (
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
          {required && <span className={styles.required} aria-label="required"> *</span>}
        </label>
      )}
      <div className={styles.control}>{children}</div>
      {error && (
        <div className={styles.error} role="alert" aria-live="polite">{error}</div>
      )}
      {!error && hint && (
        <div className={styles.hint}>{hint}</div>
      )}
    </div>
  );
}
