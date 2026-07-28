// ===== Toast Context =====
// Extracted from ToastProvider to satisfy react-refresh (components-only file rule)

import { createContext, useContext } from 'react';

type ToastType = 'success' | 'error' | 'info';

export interface ToastContextValue {
  addToast: (type: ToastType, message: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};
