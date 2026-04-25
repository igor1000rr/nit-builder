/**
 * SettingsDrawer — modal-overlay с настройками: account, tunnel token,
 * shortcuts, about. Раньше всё это было одним файлом ~500 LOC; сейчас
 * shell для секций из app/components/settings/.
 *
 * Открывается из nav (⌘+,) или из AccountBadge "Settings · token" item.
 */

import { useState, useEffect } from "react";
import { AccountSection } from "~/components/settings/AccountSection";
import { TunnelTokenSection } from "~/components/settings/TunnelTokenSection";
import { ShortcutsSection } from "~/components/settings/ShortcutsSection";
import { AboutSection } from "~/components/settings/AboutSection";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function SettingsDrawer({ isOpen, onClose }: Props) {
  // resetSignal — toggle, который нужен дочерним секциям чтобы сбросить
  // внутренний стейт (например TunnelTokenSection: cancel regenerate flow,
  // forget shown token). useEffect в дочерних слушает resetSignal.
  const [resetSignal, setResetSignal] = useState(false);
  useEffect(() => {
    if (!isOpen) {
      setResetSignal((s) => !s);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] backdrop-blur-sm flex items-start justify-center pt-[10vh]"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden"
        style={{
          background: "var(--bg)",
          border: "1px solid var(--line-strong)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-5 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div>
            <div
              className="text-[10px] tracking-[0.2em] uppercase mb-1"
              style={{ color: "var(--accent-glow)" }}
            >
              // settings
            </div>
            <h2 className="nit-display text-[20px]" style={{ color: "var(--ink)" }}>
              CONFIGURATION
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 transition flex items-center justify-center"
            style={{
              border: "1px solid var(--line-strong)",
              color: "var(--muted)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--magenta)";
              e.currentTarget.style.color = "var(--magenta)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--line-strong)";
              e.currentTarget.style.color = "var(--muted)";
            }}
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <AccountSection onClose={onClose} />
          <TunnelTokenSection resetSignal={resetSignal} />
          <ShortcutsSection />
          <AboutSection />
        </div>
      </div>
    </div>
  );
}
