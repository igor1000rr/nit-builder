/**
 * LandingNav — fixed nav на лендинге с anchor-навигацией к секциям
 * (problem / how / stack / features) + правый CTA-button "Launch app".
 *
 * Рендерится отдельно от editor-nav (тот в home.tsx) — у лендинга своя
 * структура и свой brand-feel.
 */

type Props = {
  isAuthed: boolean;
};

export function LandingNav({ isAuthed }: Props) {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-[12px]"
      style={{
        background: "rgba(5,6,10,0.55)",
        borderBottom: "1px solid var(--line)",
        padding: "20px 32px",
      }}
    >
      <div className="max-w-[1400px] mx-auto flex items-center justify-between">
        <a href="/" className="flex items-center gap-3 no-underline">
          <span
            className="block w-7 h-7 relative"
            style={{
              background:
                "conic-gradient(from 0deg, var(--accent), var(--magenta), var(--acid), var(--accent))",
              animation: "nit-spin 8s linear infinite",
            }}
          >
            <span className="absolute inset-[3px]" style={{ background: "var(--bg)" }} />
          </span>
          <span className="nit-display text-lg text-[color:var(--ink)]">NITGEN</span>
        </a>

        <ul className="hidden md:flex gap-8 list-none text-[11px] tracking-[0.15em] uppercase">
          <li>
            <a href="#problem" className="text-[color:var(--muted)] hover:text-[color:var(--accent-glow)] no-underline transition">
              Problem
            </a>
          </li>
          <li>
            <a href="#how" className="text-[color:var(--muted)] hover:text-[color:var(--accent-glow)] no-underline transition">
              How it works
            </a>
          </li>
          <li>
            <a href="#stack" className="text-[color:var(--muted)] hover:text-[color:var(--accent-glow)] no-underline transition">
              Stack
            </a>
          </li>
          <li>
            <a href="#features" className="text-[color:var(--muted)] hover:text-[color:var(--accent-glow)] no-underline transition">
              Features
            </a>
          </li>
        </ul>

        <a
          href={isAuthed ? "/" : "/register"}
          className="px-5 py-2.5 text-[11px] font-bold tracking-[0.15em] uppercase no-underline transition"
          style={{
            border: "1px solid var(--accent)",
            color: "var(--accent-glow)",
          }}
        >
          {isAuthed ? "Open app →" : "Launch app"}
        </a>
      </div>
    </nav>
  );
}
