import React from 'react';
import classNames from 'classnames';
import styles from './Card.module.scss';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

function Card({ children, className, padding = 'md' }: CardProps) {
  return (
    <div className={classNames(styles.card, styles[`padding-${padding}`], className)}>
      {children}
    </div>
  );
}

function CardHeader({ children, className, actions }: CardHeaderProps) {
  return (
    <div className={classNames(styles.header, className)}>
      <div className={styles.headerContent}>{children}</div>
      {actions && <div className={styles.headerActions}>{actions}</div>}
    </div>
  );
}

function CardBody({ children, className }: CardBodyProps) {
  return (
    <div className={classNames(styles.body, className)}>
      {children}
    </div>
  );
}

function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={classNames(styles.footer, className)}>
      {children}
    </div>
  );
}

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export default Card;
