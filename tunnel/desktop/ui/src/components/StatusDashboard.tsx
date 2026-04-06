import type { ReactNode } from "react";
import type { TunnelStatus } from "../types";

type Config = {
  serverUrl: string;
  token: string;
  lmStudioUrl: string;
};

type ActiveRequest = {
  id: string;
  tokens: number;
  elapsedMs: number;
};

type Props = {
  status: TunnelStatus;
  config: Config;
  activeRequests: ActiveRequest[];
  logs: ReactNode;
  onStop: () => void;
  onClearToken: () => void;
};

export function StatusDashboard({
  status,
  config,
  activeRequests,
  logs,
  onStop,
  onClearToken,
}: Props) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "0",
      }}
    >
      {/* Header with status */}
      <StatusHeader status={status} />

      {/* Info strip */}
      <div
        style={{
          padding: "12px 20px",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          fontSize: "11px",
          color: "var(--text-muted)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
          <span>Server</span>
          <span style={{ color: "var(--text)", fontFamily: "monospace" }}>
            {config.serverUrl.replace(/^wss?:\/\//, "")}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>LM Studio</span>
          <span style={{ color: "var(--text)", fontFamily: "monospace" }}>
            {config.lmStudioUrl.replace(/^https?:\/\//, "")}
          </span>
        </div>
      </div>

      {/* Active requests */}
      <div style={{ padding: "16px 20px" }}>
        <div
          style={{
            fontSize: "11px",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "8px",
          }}
        >
          Активные запросы {activeRequests.length > 0 && `(${activeRequests.length})`}
        </div>
        {activeRequests.length === 0 ? (
          <div
            style={{
              padding: "16px",
              background: "var(--surface)",
              border: "1px dashed var(--border)",
              borderRadius: "8px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "12px",
            }}
          >
            Ожидаем запросов с сайта...
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {activeRequests.map((req) => (
              <div
                key={req.id}
                style={{
                  padding: "10px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "12px",
                }}
              >
                <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>
                  {req.id.slice(0, 8)}...
                </span>
                <span style={{ color: "var(--accent)" }}>
                  {req.tokens} tokens · {(req.elapsedMs / 1000).toFixed(1)}s
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Logs */}
      <div style={{ flex: 1, overflow: "hidden", padding: "0 20px" }}>{logs}</div>

      {/* Footer */}
      <div
        style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: "8px",
          background: "var(--surface)",
        }}
      >
        <button
          type="button"
          onClick={onStop}
          style={{
            flex: 1,
            padding: "10px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--text)",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          Остановить
        </button>
        <button
          type="button"
          onClick={onClearToken}
          title="Забыть токен"
          style={{
            padding: "10px 14px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--danger)",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          ⟲
        </button>
      </div>
    </div>
  );
}

function StatusHeader({ status }: { status: TunnelStatus }) {
  let label = "";
  let subtitle = "";
  let color = "var(--text-muted)";
  let dotColor = "#64748b";
  let pulse = false;

  switch (status.status) {
    case "idle":
      label = "Idle";
      subtitle = "Запускаем...";
      break;
    case "probing_lm_studio":
      label = "Проверяем LM Studio";
      subtitle = "Ищем локальный сервер";
      color = "var(--warning)";
      dotColor = "#f59e0b";
      pulse = true;
      break;
    case "connecting":
      label = "Подключаемся";
      subtitle = "Установка WebSocket";
      color = "var(--accent)";
      dotColor = "#3b82f6";
      pulse = true;
      break;
    case "connected":
      label = "Подключён";
      subtitle = `${status.model}`;
      color = "var(--success)";
      dotColor = "#10b981";
      pulse = true;
      break;
    case "disconnected":
      label = "Отключён";
      subtitle = `Повтор через ${status.retry_in_seconds}s`;
      color = "var(--danger)";
      dotColor = "#ef4444";
      break;
    case "auth_failed":
      label = "Неверный токен";
      subtitle = "Замени токен в настройках";
      color = "var(--danger)";
      dotColor = "#ef4444";
      break;
    case "lm_studio_unreachable":
      label = "LM Studio недоступен";
      subtitle = "Проверь что LM Studio запущен";
      color = "var(--danger)";
      dotColor = "#ef4444";
      break;
  }

  return (
    <div
      style={{
        padding: "24px 20px",
        display: "flex",
        alignItems: "center",
        gap: "14px",
      }}
    >
      <div
        style={{
          width: "14px",
          height: "14px",
          borderRadius: "50%",
          background: dotColor,
          boxShadow: pulse ? `0 0 12px ${dotColor}` : "none",
          animation: pulse ? "pulse 2s ease-in-out infinite" : "none",
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "16px", fontWeight: 600, color }}>{label}</div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
          {subtitle}
        </div>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
