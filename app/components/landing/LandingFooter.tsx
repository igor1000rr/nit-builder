/**
 * LandingFooter — финальный footer с brand block + 2 колонки ссылок
 * (Product / Project) + bottom copyright строка с версией.
 *
 * Версия читается из shared/src/version.ts — single source of truth,
 * раньше был хардкод "v2.0.0-alpha" расходящийся с реальной.
 */

import { NIT_SERVER_VERSION } from "@nit/shared";

export function LandingFooter() {
  return (
    <footer
      className="relative z-10 max-w-[1400px] mx-auto px-8 pt-16 pb-8"
      style={{ borderTop: "1px solid var(--line)" }}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
        <div className="col-span-2">
          <div className="nit-display text-[42px] leading-[0.9] mb-4">
            NIT
            <span style={{ color: "transparent", WebkitTextStroke: "1.5px var(--accent-glow)" }}>
              GEN
            </span>
          </div>
          <p className="text-[12px] text-[color:var(--muted)] leading-[1.7] max-w-[320px]">
            Peer-to-peer AI-конструктор сайтов. Open source. MIT license.
            Built in Belarus, hosted on bare metal, runs on your local LLM.
          </p>
        </div>
        <FootCol
          title="Product"
          items={[
            ["Editor", "/"],
            ["Download CLI", "/download"],
            ["Templates", "/#stack"],
          ]}
        />
        <FootCol
          title="Project"
          items={[
            ["GitHub", "https://github.com/igor1000rr/nit-builder"],
            ["Changelog", "https://github.com/igor1000rr/nit-builder/blob/main/CHANGELOG.md"],
            ["License", "https://github.com/igor1000rr/nit-builder/blob/main/LICENSE"],
          ]}
        />
      </div>
      <div
        className="flex justify-between flex-wrap gap-4 pt-8 text-[10px] tracking-[0.1em] uppercase text-[color:var(--muted)]"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <div>© 2026 · NITGEN.ORG · v{NIT_SERVER_VERSION}</div>
        <div>Built with rage in Belarus · Local LLM only, no compromise</div>
      </div>
    </footer>
  );
}

function FootCol({ title, items }: { title: string; items: Array<[string, string]> }) {
  return (
    <div>
      <h5 className="text-[11px] tracking-[0.2em] uppercase mb-5" style={{ color: "var(--accent-glow)" }}>
        {title}
      </h5>
      <ul className="list-none flex flex-col gap-2.5">
        {items.map(([label, href]) => (
          <li key={label}>
            <a
              href={href}
              className="text-[12px] text-[color:var(--muted)] hover:text-[color:var(--ink)] no-underline transition"
              {...(href.startsWith("http") ? { target: "_blank", rel: "noopener" } : {})}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
