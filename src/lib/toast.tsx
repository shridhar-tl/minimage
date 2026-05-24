import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { Icon, type IconName } from '../components/Icon';
import './toast.scss';
import { uid } from './util';

type ToastKind = 'info' | 'success' | 'error' | 'warn';
interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
  warn: (m: string) => void;
}

const ICON_BY_KIND: Record<ToastKind, IconName> = {
  info: 'info',
  success: 'checkCircle',
  error: 'xCircle',
  warn: 'alert',
};

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastCtx);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = uid();
      setToasts((t) => [...t, { id, kind, message }]);
      window.setTimeout(() => remove(id), 4500);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, 'success'),
      error: (m) => show(m, 'error'),
      info: (m) => show(m, 'info'),
      warn: (m) => show(m, 'warn'),
    }),
    [show],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-host">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`} onClick={() => remove(t.id)} role="status">
            <span className="toast__icon">
              <Icon name={ICON_BY_KIND[t.kind]} size={18} />
            </span>
            <span className="toast__msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
