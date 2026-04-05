import { useEffect } from "react";

type ShortcutHandler = (e: KeyboardEvent) => void;
type Shortcut = {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: ShortcutHandler;
  description?: string;
};

export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Не срабатываем если пользователь печатает в инпуте (кроме Esc и Cmd+Enter)
      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      for (const sc of shortcuts) {
        const keyMatch = e.key === sc.key || e.key.toLowerCase() === sc.key.toLowerCase();
        if (!keyMatch) continue;

        const modsMatch =
          !!sc.ctrl === e.ctrlKey &&
          !!sc.meta === e.metaKey &&
          !!sc.shift === e.shiftKey &&
          !!sc.alt === e.altKey;

        if (!modsMatch) continue;

        // Esc и Cmd+Enter работают даже в инпутах, остальное нет
        const allowInInput = e.key === "Escape" || ((e.metaKey || e.ctrlKey) && e.key === "Enter");
        if (isEditable && !allowInInput) continue;

        e.preventDefault();
        sc.handler(e);
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts, enabled]);
}
