import React, { useState, useCallback, createContext, useContext, ReactNode } from 'react';
import classNames from 'classnames';
import styles from './Toast.module.scss';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastMessage {
  id: string;
  variant: ToastVariant;
  message: string;
  title?: string;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => undefined });

let toastCount = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info', title?: string) => {
    const id = `toast-${++toastCount}`;
    setToasts((prev) => [...prev, { id, variant, message, title }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={styles.container} aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={classNames(styles.toast, styles[t.variant])} role="alert">
            <div className={styles.content}>
              {t.title && <div className={styles.title}>{t.title}</div>}
              <div className={styles.message}>{t.message}</div>
            </div>
            <button
              className={styles.close}
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
