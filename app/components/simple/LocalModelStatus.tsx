import { useEffect, useState } from "react";

type Status =
  | { state: "checking" }
  | { state: "found"; model: string }
  | { state: "not-found" }
  | { state: "https-blocked" }; // mixed content: can't reach localhost from HTTPS

export function LocalModelStatus() {
  const [status, setStatus] = useState<Status>({ state: "checking" });

  useEffect(() => {
    // Mixed content: HTTPS страница не может достучаться до HTTP localhost
    if (typeof window !== "undefined" && window.location.protocol === "https:") {
      setStatus({ state: "https-blocked" });
      return;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);

    fetch("http://localhost:1234/v1/models", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { data?: Array<{ id: string }> }) => {
        const models = (data.data ?? []).map((m) => m.id);
        const primary = models[0];
        if (primary) setStatus({ state: "found", model: primary });
        else setStatus({ state: "not-found" });
      })
      .catch(() => setStatus({ state: "not-found" }))
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, []);

  if (status.state === "checking") {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 text-slate-400 text-sm border border-slate-700">
        <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
        Ищем локальную модель...
      </div>
    );
  }

  if (status.state === "found") {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-400 text-sm border border-emerald-500/30">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        LM Studio: <span className="font-mono">{status.model}</span> · бесплатно
      </div>
    );
  }

  if (status.state === "https-blocked") {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 text-blue-400 text-sm border border-blue-500/30">
        <span className="w-2 h-2 rounded-full bg-blue-400" />
        Используется Groq · для локальной модели{" "}
        <a
          href="https://github.com/igor1000rr/nit-builder#quick-start"
          target="_blank"
          rel="noopener"
          className="underline hover:text-blue-300"
        >
          запусти локально
        </a>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 text-amber-400 text-sm border border-amber-500/30">
      <span className="w-2 h-2 rounded-full bg-amber-400" />
      LM Studio не найден — используем Groq (бесплатно онлайн)
    </div>
  );
}
