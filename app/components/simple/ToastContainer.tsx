import { useToasts, type Toast } from "~/lib/stores/toastStore";

const STYLES: Record<Toast["type"], { bg: string; border: string; icon: string }> = {
  success: { bg: "bg-emerald-500/10", border: "border-emerald-500/40", icon: "✓" },
  error: { bg: "bg-red-500/10", border: "border-red-500/40", icon: "✕" },
  info: { bg: "bg-blue-500/10", border: "border-blue-500/40", icon: "ⓘ" },
  warning: { bg: "bg-amber-500/10", border: "border-amber-500/40", icon: "⚠" },
};

const TEXT_COLOR: Record<Toast["type"], string> = {
  success: "text-emerald-300",
  error: "text-red-300",
  info: "text-blue-300",
  warning: "text-amber-300",
};

export function ToastContainer() {
  const { toasts, dismiss } = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-md">
      {toasts.map((t) => {
        const s = STYLES[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-md ${s.bg} ${s.border} shadow-2xl animate-[slide-in_0.2s_ease-out]`}
          >
            <span className={`text-lg ${TEXT_COLOR[t.type]} font-bold`}>{s.icon}</span>
            <p className={`text-sm flex-1 ${TEXT_COLOR[t.type]}`}>{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className={`${TEXT_COLOR[t.type]} opacity-60 hover:opacity-100 transition`}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
