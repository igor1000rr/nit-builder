import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LmStudioProbeResult } from "../types";

type Config = {
  serverUrl: string;
  token: string;
  lmStudioUrl: string;
};

type Props = {
  initial: Config;
  onSubmit: (config: Config) => void;
  loading: boolean;
};

export function LoginForm({ initial, onSubmit, loading }: Props) {
  const [serverUrl, setServerUrl] = useState(initial.serverUrl);
  const [token, setToken] = useState(initial.token);
  const [lmStudioUrl, setLmStudioUrl] = useState(initial.lmStudioUrl);
  const [lmStudioStatus, setLmStudioStatus] = useState<
    "untested" | "checking" | "ok" | "error"
  >("untested");
  const [lmStudioModel, setLmStudioModel] = useState<string | null>(null);
  const [lmStudioError, setLmStudioError] = useState<string | null>(null);

  async function testLmStudio() {
    setLmStudioStatus("checking");
    setLmStudioError(null);
    try {
      const result = (await invoke("probe_lm_studio", {
        url: lmStudioUrl,
      })) as LmStudioProbeResult;
      if (result.available) {
        setLmStudioStatus("ok");
        setLmStudioModel(result.model);
      } else {
        setLmStudioStatus("error");
        setLmStudioError(result.error ?? "unknown");
      }
    } catch (err) {
      setLmStudioStatus("error");
      setLmStudioError(String(err));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    onSubmit({ serverUrl, token: token.trim(), lmStudioUrl });
  }

  return (
    <div
      style={{
        padding: "24px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <div
          style={{
            fontSize: "28px",
            fontWeight: 800,
            background: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "4px",
          }}
        >
          NIT Tunnel
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          Proxy your GPU to NIT Builder
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "16px", flex: 1 }}
      >
        {/* Token */}
        <div>
          <label
            htmlFor="token"
            style={{
              display: "block",
              fontSize: "12px",
              color: "var(--text-muted)",
              marginBottom: "6px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Tunnel Token
          </label>
          <input
            id="token"
            type="password"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="nit_..."
            style={inputStyle}
          />
          <div
            style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              marginTop: "4px",
            }}
          >
            Получить на <span style={{ color: "var(--accent)" }}>nit.vibecoding.by/register</span>
          </div>
        </div>

        {/* LM Studio URL */}
        <div>
          <label
            htmlFor="lmstudio"
            style={{
              display: "block",
              fontSize: "12px",
              color: "var(--text-muted)",
              marginBottom: "6px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            LM Studio URL
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              id="lmstudio"
              type="text"
              value={lmStudioUrl}
              onChange={(e) => {
                setLmStudioUrl(e.target.value);
                setLmStudioStatus("untested");
              }}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={testLmStudio}
              disabled={lmStudioStatus === "checking"}
              style={{
                ...buttonStyle,
                padding: "8px 14px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              {lmStudioStatus === "checking" ? "..." : "Test"}
            </button>
          </div>
          {lmStudioStatus === "ok" && lmStudioModel && (
            <div style={{ fontSize: "11px", color: "var(--success)", marginTop: "4px" }}>
              ✓ {lmStudioModel}
            </div>
          )}
          {lmStudioStatus === "error" && (
            <div style={{ fontSize: "11px", color: "var(--danger)", marginTop: "4px" }}>
              ✗ {lmStudioError}
            </div>
          )}
        </div>

        {/* Server URL (advanced) */}
        <details>
          <summary
            style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            Расширенные настройки
          </summary>
          <div style={{ marginTop: "10px" }}>
            <label
              htmlFor="server"
              style={{
                display: "block",
                fontSize: "12px",
                color: "var(--text-muted)",
                marginBottom: "6px",
              }}
            >
              Server URL
            </label>
            <input
              id="server"
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              style={inputStyle}
            />
          </div>
        </details>

        <div style={{ flex: 1 }} />

        <button
          type="submit"
          disabled={loading || !token.trim()}
          style={{
            ...buttonStyle,
            background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
            color: "white",
            padding: "12px",
            fontWeight: 600,
            fontSize: "14px",
          }}
        >
          {loading ? "Запускаем..." : "Подключиться →"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--text)",
  fontSize: "13px",
  outline: "none",
  transition: "border-color 0.15s",
};

const buttonStyle: React.CSSProperties = {
  borderRadius: "8px",
  border: "none",
  cursor: "pointer",
  transition: "all 0.15s",
};
