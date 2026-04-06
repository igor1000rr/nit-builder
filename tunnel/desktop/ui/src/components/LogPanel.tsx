export type LogEntry = {
  id: string;
  timestamp: Date;
  message: string;
};

type Props = {
  logs: LogEntry[];
};

export function LogPanel({ logs }: Props) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          fontSize: "11px",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "8px",
        }}
      >
        Лог
      </div>
      <div
        style={{
          flex: 1,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "10px",
          overflowY: "auto",
          fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
          fontSize: "11px",
          minHeight: 0,
        }}
      >
        {logs.length === 0 ? (
          <div
            style={{
              color: "var(--text-muted)",
              textAlign: "center",
              padding: "16px 0",
            }}
          >
            пусто
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              style={{
                display: "flex",
                gap: "8px",
                padding: "2px 0",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
              }}
            >
              <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                {formatTime(log.timestamp)}
              </span>
              <span style={{ color: "var(--text)", wordBreak: "break-word" }}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}
