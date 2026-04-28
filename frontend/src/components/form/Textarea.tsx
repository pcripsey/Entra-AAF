import React from 'react';
import classNames from 'classnames';
import styles from './Textarea.module.scss';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({
  error,
  className,
  ...rest
}, ref) => {
  return (
    <textarea
      ref={ref}
      className={classNames(styles.textarea, { [styles.error]: error }, className)}
      {...rest}
    />
  );
});

Textarea.displayName = 'Textarea';
export default Textarea;
