/**
 * AboutSection — нижний блок с версией и внешними ссылками.
 *
 * Версия читается из shared/src/version.ts (single source of truth) —
 * раньше был хардкод "v2.0.0-alpha" расходящийся с реальной.
 */

import { NIT_SERVER_VERSION } from "@nit/shared";

export function AboutSection() {
  return (
    <div className="pt-4" style={{ borderTop: "1px solid var(--line)" }}>
      <div
        className="flex items-center justify-between text-[10px] tracking-[0.1em] uppercase"
        style={{ color: "var(--muted-2)" }}
      >
        <span>NITGEN · v{NIT_SERVER_VERSION}</span>
        <div className="flex gap-4">
          <a
            href="https://github.com/igor1000rr/nit-builder"
            target="_blank"
            rel="noopener"
            className="no-underline transition hover:text-[color:var(--accent-glow)]"
            style={{ color: "var(--muted)" }}
          >
            GitHub
          </a>
          <a
            href="https://t.me/igor1000rr"
            target="_blank"
            rel="noopener"
            className="no-underline transition hover:text-[color:var(--accent-glow)]"
            style={{ color: "var(--muted)" }}
          >
            Telegram
          </a>
        </div>
      </div>
    </div>
  );
}
