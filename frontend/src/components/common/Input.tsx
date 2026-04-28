import React from 'react';
import classNames from 'classnames';
import styles from './Input.module.scss';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  error,
  leftAddon,
  rightAddon,
  className,
  ...rest
}, ref) => {
  if (leftAddon || rightAddon) {
    return (
      <div className={classNames(styles.inputGroup, { [styles.error]: error })}>
        {leftAddon && <span className={styles.addon}>{leftAddon}</span>}
        <input
          ref={ref}
          className={classNames(styles.input, styles.grouped, className)}
          {...rest}
        />
        {rightAddon && <span className={classNames(styles.addon, styles.addonRight)}>{rightAddon}</span>}
      </div>
    );
  }

  return (
    <input
      ref={ref}
      className={classNames(styles.input, { [styles.error]: error }, className)}
      {...rest}
    />
  );
});

Input.displayName = 'Input';
export default Input;
