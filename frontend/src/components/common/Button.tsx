import React from 'react';
import classNames from 'classnames';
import styles from './Button.module.scss';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  children,
  className,
  disabled,
  ...rest
}, ref) => {
  const cls = classNames(
    styles.btn,
    styles[variant],
    styles[size],
    { [styles.fullWidth]: fullWidth, [styles.loading]: loading },
    className,
  );

  return (
    <button ref={ref} className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {!loading && leftIcon && <span className={styles.icon}>{leftIcon}</span>}
      {children && <span>{children}</span>}
      {!loading && rightIcon && <span className={styles.icon}>{rightIcon}</span>}
    </button>
  );
});

Button.displayName = 'Button';
export default Button;
