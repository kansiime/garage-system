'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, message, type, duration }]);
    if (duration > 0) {
      setTimeout(() => remove(id), duration);
    }
    return id;
  }, [remove]);

  const api = {
    success: (msg, duration) => push(msg, 'success', duration),
    error: (msg, duration) => push(msg, 'error', duration ?? 6000),
    info: (msg, duration) => push(msg, 'info', duration),
    warning: (msg, duration) => push(msg, 'warning', duration),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed z-[100] top-4 right-4 left-4 sm:left-auto sm:right-6 sm:top-6 flex flex-col gap-2 pointer-events-none sm:max-w-sm">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback so the app doesn't crash if Provider is missing
    return {
      success: (m) => console.log('[toast success]', m),
      error: (m) => console.error('[toast error]', m),
      info: (m) => console.log('[toast info]', m),
      warning: (m) => console.warn('[toast warning]', m),
    };
  }
  return ctx;
}

function ToastItem({ toast, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Enter animation
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const styles = {
    success: {
      bg: 'bg-green-50 border-green-200',
      icon: '✅',
      text: 'text-green-900',
    },
    error: {
      bg: 'bg-red-50 border-red-200',
      icon: '⚠️',
      text: 'text-red-900',
    },
    warning: {
      bg: 'bg-amber-50 border-amber-200',
      icon: '🔔',
      text: 'text-amber-900',
    },
    info: {
      bg: 'bg-blue-50 border-blue-200',
      icon: 'ℹ️',
      text: 'text-blue-900',
    },
  }[toast.type] || {
    bg: 'bg-slate-50 border-slate-200',
    icon: '💬',
    text: 'text-slate-900',
  };

  return (
    <div
      className={`pointer-events-auto border rounded-lg shadow-lg px-4 py-3 flex items-start gap-3 transform transition-all duration-200 ${styles.bg} ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
      }`}
    >
      <span className="text-lg flex-shrink-0">{styles.icon}</span>
      <p className={`text-sm font-medium flex-1 ${styles.text}`}>{toast.message}</p>
      <button
        onClick={onClose}
        className={`flex-shrink-0 text-lg leading-none opacity-60 hover:opacity-100 ${styles.text}`}
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );
}