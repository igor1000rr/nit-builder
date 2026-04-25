/**
 * ShortcutsSection — таблица горячих клавиш.
 * Источник правды о shortcut'ах — useKeyboardShortcuts в home.tsx, здесь
 * только display. Если меняешь shortcut там — обнови SHORTCUTS массив тут.
 */

const SHORTCUTS = [
  { keys: "⌘ + Enter", desc: "Создать сайт" },
  { keys: "⌘ + H", desc: "История" },
  { keys: "⌘ + D", desc: "Скачать HTML" },
  { keys: "⌘ + ,", desc: "Настройки" },
  { keys: "Esc", desc: "Закрыть / Отмена" },
];

export function ShortcutsSection() {
  return (
    <div>
      <div
        className="text-[10px] tracking-[0.2em] uppercase mb-3"
        style={{ color: "var(--accent-glow)" }}
      >
        // shortcuts
      </div>
      <div
        className="divide-y"
        style={{ border: "1px solid var(--line)", background: "rgba(10,13,24,0.4)" }}
      >
        {SHORTCUTS.map((sc) => (
          <div
            key={sc.keys}
            className="flex items-center justify-between px-4 py-2.5"
            style={{ borderColor: "var(--line)" }}
          >
            <span className="text-[12px]" style={{ color: "var(--ink-dim)" }}>
              {sc.desc}
            </span>
            <kbd
              className="px-2 py-1 text-[10px] tracking-[0.05em] font-mono"
              style={{
                border: "1px solid var(--line-strong)",
                color: "var(--accent-glow)",
                background: "rgba(0,212,255,0.04)",
              }}
            >
              {sc.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
