import { useState, useEffect, useCallback } from "react";

export type Toast = {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
  duration?: number;
};

let listeners: Array<(toasts: Toast[]) => void> = [];
let currentToasts: Toast[] = [];

export const toast = {
  success: (message: string, duration = 3000) => push({ type: "success", message, duration }),
  error: (message: string, duration = 5000) => push({ type: "error", message, duration }),
  info: (message: string, duration = 3000) => push({ type: "info", message, duration }),
  warning: (message: string, duration = 4000) => push({ type: "warning", message, duration }),
};

function push(opts: Omit<Toast, "id">) {
  const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const t: Toast = { id, ...opts };
  currentToasts = [...currentToasts, t];
  listeners.forEach((fn) => fn(currentToasts));

  if (t.duration) {
    setTimeout(() => dismiss(id), t.duration);
  }
}

function dismiss(id: string) {
  currentToasts = currentToasts.filter((t) => t.id !== id);
  listeners.forEach((fn) => fn(currentToasts));
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>(currentToasts);

  useEffect(() => {
    listeners.push(setToasts);
    return () => {
      listeners = listeners.filter((l) => l !== setToasts);
    };
  }, []);

  const remove = useCallback((id: string) => dismiss(id), []);

  return { toasts, dismiss: remove };
}
