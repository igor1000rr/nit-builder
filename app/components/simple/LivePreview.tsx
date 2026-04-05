import { useState } from "react";

type Viewport = "mobile" | "tablet" | "desktop";

type Props = {
  html: string;
  onOpenCode: () => void;
  onNew: () => void;
};

const VIEWPORT_WIDTH: Record<Viewport, string> = {
  mobile: "375px",
  tablet: "768px",
  desktop: "100%",
};

export function LivePreview({ html, onOpenCode, onNew }: Props) {
  const [viewport, setViewport] = useState<Viewport>("desktop");

  const download = () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "site.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const openFullscreen = () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950">
        <div className="flex gap-1 bg-slate-900 rounded-full p-1">
          {(["mobile", "tablet", "desktop"] as Viewport[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setViewport(v)}
              className={`px-4 py-1.5 text-xs rounded-full transition ${
                viewport === v ? "bg-blue-500 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {v === "mobile" ? "📱" : v === "tablet" ? "📲" : "🖥"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onNew} className="px-4 py-2 text-xs text-slate-400 hover:text-white transition">
            ← Новый
          </button>
          <button type="button" onClick={onOpenCode} className="px-4 py-2 text-xs bg-slate-800 text-white rounded-full hover:bg-slate-700 transition">
            {"</>"} Код
          </button>
          <button type="button" onClick={openFullscreen} className="px-4 py-2 text-xs bg-slate-800 text-white rounded-full hover:bg-slate-700 transition">
            ⛶
          </button>
          <button type="button" onClick={download} className="px-4 py-2 text-xs bg-gradient-to-r from-blue-500 to-violet-500 text-white rounded-full font-medium hover:scale-105 transition">
            📥 Скачать
          </button>
        </div>
      </div>

      <div className="flex-1 bg-slate-900 p-4 overflow-auto flex items-start justify-center">
        <iframe
          title="preview"
          srcDoc={html}
          sandbox="allow-scripts"
          className="border-0 bg-white rounded-xl shadow-2xl transition-all"
          style={{
            width: VIEWPORT_WIDTH[viewport],
            maxWidth: "100%",
            height: "calc(100vh - 140px)",
          }}
        />
      </div>
    </div>
  );
}
