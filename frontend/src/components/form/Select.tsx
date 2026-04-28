import React from 'react';
import classNames from 'classnames';
import styles from './Select.module.scss';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  placeholder?: string;
  error?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({
  options,
  placeholder,
  error,
  className,
  ...rest
}, ref) => {
  return (
    <select
      ref={ref}
      className={classNames(styles.select, { [styles.error]: error }, className)}
      {...rest}
    >
      {placeholder && (
        <option value="" disabled>{placeholder}</option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  );
});

Select.displayName = 'Select';
export default Select;
