import { describe, it, expect, beforeEach, vi } from "vitest";
import type { WebSocket } from "ws";
import {
  registerTunnel,
  unregisterTunnel,
  getTunnelForUser,
  hasTunnelForUser,
  getTunnelCount,
  registerBrowser,
  unregisterBrowser,
  routeRequest,
  abortRequest,
  handleTunnelResponse,
  setRequestTemplate,
  updateHeartbeat,
  getStats,
  resetRegistry,
  revokeUserTunnels,
  revokeUserBrowsers,
  type TunnelConnection,
  type BrowserSession,
} from "~/lib/services/tunnelRegistry.server";

// Mock WebSocket — tracks sent messages and close calls
type MockWs = WebSocket & {
  sent: unknown[];
  closeCalls: Array<{ code?: number; reason?: string }>;
};

function mockWs(): MockWs {
  const sent: unknown[] = [];
  const closeCalls: Array<{ code?: number; reason?: string }> = [];
  return {
    sent,
    closeCalls,
    send(data: unknown) {
      sent.push(JSON.parse(data as string));
    },
    close(code?: number, reason?: string) {
      closeCalls.push({ code, reason });
    },
    readyState: 1,
  } as unknown as MockWs;
}

function makeTunnel(userId: string, connectionId = `t-${userId}-${Math.random()}`): {
  conn: TunnelConnection;
  ws: MockWs;
} {
  const ws = mockWs();
  const conn: TunnelConnection = {
    connectionId,
    userId,
    ws,
    capabilities: {
      runtime: "lmstudio_proxy",
      model: "qwen2.5-coder-7b",
      contextWindow: 32_000,
    },
    clientVersion: "0.1.0",
    connectedAt: Date.now(),
    lastHeartbeat: Date.now(),
  };
  return { conn, ws };
}

function makeBrowser(userId: string, sessionId = `b-${userId}-${Math.random()}`): {
  session: BrowserSession;
  ws: MockWs;
} {
  const ws = mockWs();
  const session: BrowserSession = {
    sessionId,
    userId,
    ws,
    connectedAt: Date.now(),
    sessionVersion: 0,
  };
  return { session, ws };
}

describe("tunnelRegistry", () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe("tunnel registration", () => {
    it("registers a single tunnel", () => {
      const { conn } = makeTunnel("alice");
      registerTunnel(conn);
      expect(hasTunnelForUser("alice")).toBe(true);
      expect(getTunnelCount("alice")).toBe(1);
    });

    it("allows multiple tunnels per user", () => {
      const { conn: c1 } = makeTunnel("alice", "t1");
      const { conn: c2 } = makeTunnel("alice", "t2");
      registerTunnel(c1);
      registerTunnel(c2);
      expect(getTunnelCount("alice")).toBe(2);
    });

    it("isolates tunnels by user", () => {
      const { conn: a } = makeTunnel("alice", "t-a");
      const { conn: b } = makeTunnel("bob", "t-b");
      registerTunnel(a);
      registerTunnel(b);
      expect(getTunnelCount("alice")).toBe(1);
      expect(getTunnelCount("bob")).toBe(1);
    });

    it("unregisters tunnel by connectionId", () => {
      const { conn } = makeTunnel("alice", "t-unique");
      registerTunnel(conn);
      unregisterTunnel("t-unique");
      expect(hasTunnelForUser("alice")).toBe(false);
    });

    it("keeps other tunnels when unregistering one of multiple", () => {
      const { conn: c1 } = makeTunnel("alice", "t1");
      const { conn: c2 } = makeTunnel("alice", "t2");
      registerTunnel(c1);
      registerTunnel(c2);
      unregisterTunnel("t1");
      expect(getTunnelCount("alice")).toBe(1);
      expect(getTunnelForUser("alice")?.connectionId).toBe("t2");
    });

    it("выбирает least-busy туннель когда у юзера несколько", () => {
      const browser = makeBrowser("alice", "b-lb");
      registerBrowser(browser.session);

      const { conn: c1 } = makeTunnel("alice", "t-busy");
      const { conn: c2 } = makeTunnel("alice", "t-idle");
      registerTunnel(c1);
      registerTunnel(c2);

      // Забиваем первый туннель одним in-flight запросом. routeRequest
      // сам вызовет getTunnelForUser — поскольку pending=0 на обоих,
      // возьмёт c1 (стабильно первый).
      routeRequest({
        requestId: "req-busy-1",
        userId: "alice",
        browserSessionId: "b-lb",
        system: "s",
        prompt: "p1",
        maxOutputTokens: 100,
        temperature: 0.4,
      });

      // Теперь у c1 pending=1, у c2 pending=0. getTunnelForUser должен
      // вернуть c2 (least-busy).
      const next = getTunnelForUser("alice");
      expect(next?.connectionId).toBe("t-idle");
    });

    it("updates heartbeat timestamp", () => {
      const { conn } = makeTunnel("alice", "t-hb");
      const before = conn.lastHeartbeat;
      registerTunnel(conn);
      // Wait a tick to ensure timestamp differs
      const future = before + 1000;
      vi.useFakeTimers();
      vi.setSystemTime(future);
      updateHeartbeat("t-hb");
      expect(conn.lastHeartbeat).toBeGreaterThanOrEqual(future);
      vi.useRealTimers();
    });
  });

  describe("browser registration", () => {
    it("registers browser and finds it", () => {
      const { session } = makeBrowser("alice", "s1");
      registerBrowser(session);
      // Indirect check via stats
      expect(getStats().activeBrowsers).toBe(1);
    });

    it("broadcasts tunnel_status to browser when tunnel connects after browser", () => {
      const { session, ws: bws } = makeBrowser("alice");
      registerBrowser(session);
      const { conn } = makeTunnel("alice");
      registerTunnel(conn);

      // Browser should have received a tunnel_status message
      const statusMsg = bws.sent.find(
        (m) => (m as { type: string }).type === "tunnel_status",
      );
      expect(statusMsg).toBeDefined();
      expect((statusMsg as { status: string }).status).toBe("online");
    });

    it("broadcasts offline to browser when last tunnel disconnects", () => {
      const { session, ws: bws } = makeBrowser("alice");
      registerBrowser(session);
      const { conn } = makeTunnel("alice", "t-ofl");
      registerTunnel(conn);
      bws.sent.length = 0; // clear
      unregisterTunnel("t-ofl");
      const msg = bws.sent.find(
        (m) => (m as { type: string }).type === "tunnel_status",
      ) as { status: string };
      expect(msg?.status).toBe("offline");
    });

    it("unregister browser removes from registry", () => {
      const { session } = makeBrowser("alice", "s-rm");
      registerBrowser(session);
      unregisterBrowser("s-rm");
      expect(getStats().activeBrowsers).toBe(0);
    });
  });

  describe("request routing", () => {
    it("routes request when tunnel available", () => {
      const { conn, ws: tws } = makeTunnel("alice", "t-r1");
      const { session } = makeBrowser("alice", "s-r1");
      registerTunnel(conn);
      registerBrowser(session);

      const ok = routeRequest({
        requestId: "req-1",
        userId: "alice",
        browserSessionId: "s-r1",
        system: "sys prompt",
        prompt: "make a site",
        maxOutputTokens: 4000,
        temperature: 0.4,
      });

      expect(ok).toBe(true);
      // Tunnel should have received the generate message
      const gen = tws.sent.find((m) => (m as { type: string }).type === "generate");
      expect(gen).toBeDefined();
      expect((gen as { requestId: string }).requestId).toBe("req-1");
    });

    it("returns false when no tunnel available", () => {
      const { session } = makeBrowser("alice", "s-nt");
      registerBrowser(session);
      const ok = routeRequest({
        requestId: "req-nt",
        userId: "alice",
        browserSessionId: "s-nt",
        system: "sys",
        prompt: "hi",
        maxOutputTokens: 1000,
        temperature: 0.4,
      });
      expect(ok).toBe(false);
    });

    it("forwards tunnel text chunks to browser as generate_text", () => {
      const { conn } = makeTunnel("alice", "t-f1");
      const { session, ws: bws } = makeBrowser("alice", "s-f1");
      registerTunnel(conn);
      registerBrowser(session);
      routeRequest({
        requestId: "req-f1",
        userId: "alice",
        browserSessionId: "s-f1",
        system: "",
        prompt: "",
        maxOutputTokens: 1000,
        temperature: 0,
      });
      bws.sent.length = 0;

      handleTunnelResponse("req-f1", { type: "text", text: "<!DOCTYPE" });
      handleTunnelResponse("req-f1", { type: "text", text: " html>" });

      expect(bws.sent.length).toBe(2);
      expect((bws.sent[0] as { type: string }).type).toBe("generate_text");
      expect((bws.sent[1] as { text: string }).text).toBe(" html>");
    });

    it("forwards done event with full HTML to browser", () => {
      const { conn } = makeTunnel("alice", "t-d1");
      const { session, ws: bws } = makeBrowser("alice", "s-d1");
      registerTunnel(conn);
      registerBrowser(session);
      routeRequest({
        requestId: "req-d1",
        userId: "alice",
        browserSessionId: "s-d1",
        system: "",
        prompt: "",
        maxOutputTokens: 1000,
        temperature: 0,
      });
      setRequestTemplate("req-d1", "coffee-shop", "Кофейня");
      bws.sent.length = 0;

      handleTunnelResponse("req-d1", {
        type: "done",
        fullText: "<!DOCTYPE html><html></html>",
        durationMs: 1234,
      });

      const done = bws.sent.find(
        (m) => (m as { type: string }).type === "generate_done",
      ) as { html: string; templateId: string; templateName: string };
      expect(done).toBeDefined();
      expect(done.html).toContain("DOCTYPE");
      expect(done.templateId).toBe("coffee-shop");
      expect(done.templateName).toBe("Кофейня");
    });

    it("forwards error event to browser", () => {
      const { conn } = makeTunnel("alice", "t-e1");
      const { session, ws: bws } = makeBrowser("alice", "s-e1");
      registerTunnel(conn);
      registerBrowser(session);
      routeRequest({
        requestId: "req-e1",
        userId: "alice",
        browserSessionId: "s-e1",
        system: "",
        prompt: "",
        maxOutputTokens: 1000,
        temperature: 0,
      });
      bws.sent.length = 0;

      handleTunnelResponse("req-e1", { type: "error", error: "LLM crashed" });

      const err = bws.sent.find(
        (m) => (m as { type: string }).type === "generate_error",
      ) as { error: string; code: string };
      expect(err.error).toBe("LLM crashed");
      expect(err.code).toBe("LLM_ERROR");
    });

    it("fails pending requests when tunnel disconnects mid-stream", () => {
      const { conn } = makeTunnel("alice", "t-dc");
      const { session, ws: bws } = makeBrowser("alice", "s-dc");
      registerTunnel(conn);
      registerBrowser(session);
      routeRequest({
        requestId: "req-dc",
        userId: "alice",
        browserSessionId: "s-dc",
        system: "",
        prompt: "",
        maxOutputTokens: 1000,
        temperature: 0,
      });
      bws.sent.length = 0;

      unregisterTunnel("t-dc");

      const err = bws.sent.find(
        (m) => (m as { type: string }).type === "generate_error",
      ) as { code: string };
      expect(err).toBeDefined();
      expect(err.code).toBe("TUNNEL_DISCONNECTED");
    });

    it("abort sends message to tunnel", () => {
      const { conn, ws: tws } = makeTunnel("alice", "t-ab");
      const { session } = makeBrowser("alice", "s-ab");
      registerTunnel(conn);
      registerBrowser(session);
      routeRequest({
        requestId: "req-ab",
        userId: "alice",
        browserSessionId: "s-ab",
        system: "",
        prompt: "",
        maxOutputTokens: 1000,
        temperature: 0,
      });
      tws.sent.length = 0;

      abortRequest("req-ab");

      const ab = tws.sent.find((m) => (m as { type: string }).type === "abort") as {
        requestId: string;
      };
      expect(ab?.requestId).toBe("req-ab");
    });

    it("aborts all pending requests from disconnected browser", () => {
      const { conn, ws: tws } = makeTunnel("alice", "t-b1");
      const { session } = makeBrowser("alice", "s-b1");
      registerTunnel(conn);
      registerBrowser(session);
      routeRequest({
        requestId: "r1",
        userId: "alice",
        browserSessionId: "s-b1",
        system: "",
        prompt: "",
        maxOutputTokens: 1000,
        temperature: 0,
      });
      routeRequest({
        requestId: "r2",
        userId: "alice",
        browserSessionId: "s-b1",
        system: "",
        prompt: "",
        maxOutputTokens: 1000,
        temperature: 0,
      });
      tws.sent.length = 0;

      unregisterBrowser("s-b1");

      const aborts = tws.sent.filter((m) => (m as { type: string }).type === "abort");
      expect(aborts.length).toBe(2);
    });
  });

  describe("forced revocation", () => {
    it("revokeUserTunnels closes WS, removes from registry, returns count", () => {
      const t1 = makeTunnel("alice", "t-rv-1");
      const t2 = makeTunnel("alice", "t-rv-2");
      const tBob = makeTunnel("bob", "t-bob");
      registerTunnel(t1.conn);
      registerTunnel(t2.conn);
      registerTunnel(tBob.conn);

      const closed = revokeUserTunnels("alice", 4001, "test reason");
      expect(closed).toBe(2);
      expect(hasTunnelForUser("alice")).toBe(false);
      expect(hasTunnelForUser("bob")).toBe(true);
      expect(t1.ws.closeCalls).toEqual([{ code: 4001, reason: "test reason" }]);
      expect(t2.ws.closeCalls).toEqual([{ code: 4001, reason: "test reason" }]);
      expect(tBob.ws.closeCalls).toEqual([]);
    });

    it("revokeUserTunnels fails pending requests of revoked user", () => {
      const t = makeTunnel("alice", "t-rvp");
      const b = makeBrowser("alice", "b-rvp");
      registerTunnel(t.conn);
      registerBrowser(b.session);
      routeRequest({
        requestId: "req-rvp",
        userId: "alice",
        browserSessionId: "b-rvp",
        system: "",
        prompt: "",
        maxOutputTokens: 100,
        temperature: 0.4,
      });
      b.ws.sent.length = 0;

      revokeUserTunnels("alice", 4001, "test");

      const err = b.ws.sent.find(
        (m) => (m as { type: string }).type === "generate_error",
      ) as { code: string };
      expect(err?.code).toBe("TUNNEL_DISCONNECTED");
    });

    it("revokeUserTunnels returns 0 when user has no tunnels", () => {
      expect(revokeUserTunnels("ghost")).toBe(0);
    });

    it("revokeUserBrowsers closes WS and removes from registry", () => {
      const b1 = makeBrowser("alice", "b-rv-1");
      const b2 = makeBrowser("alice", "b-rv-2");
      const bBob = makeBrowser("bob", "b-bob");
      registerBrowser(b1.session);
      registerBrowser(b2.session);
      registerBrowser(bBob.session);

      const closed = revokeUserBrowsers("alice", 4001, "logout-all");
      expect(closed).toBe(2);
      expect(getStats().activeBrowsers).toBe(1);
      expect(b1.ws.closeCalls).toEqual([{ code: 4001, reason: "logout-all" }]);
      expect(b2.ws.closeCalls).toEqual([{ code: 4001, reason: "logout-all" }]);
      expect(bBob.ws.closeCalls).toEqual([]);
    });

    it("revokeUserBrowsers aborts pending requests from revoked sessions", () => {
      const t = makeTunnel("alice", "t-rb");
      const b = makeBrowser("alice", "b-rb");
      registerTunnel(t.conn);
      registerBrowser(b.session);
      routeRequest({
        requestId: "req-rb",
        userId: "alice",
        browserSessionId: "b-rb",
        system: "",
        prompt: "",
        maxOutputTokens: 100,
        temperature: 0.4,
      });
      t.ws.sent.length = 0;

      revokeUserBrowsers("alice", 4001, "test");

      // unregisterBrowser → abortRequest → tunnel получает abort
      const aborts = t.ws.sent.filter(
        (m) => (m as { type: string }).type === "abort",
      );
      expect(aborts.length).toBe(1);
    });

    it("revokeUserBrowsers returns 0 when user has no sessions", () => {
      expect(revokeUserBrowsers("ghost")).toBe(0);
    });

    it("revokeUserTunnels safely ignores ws.close() throws", () => {
      const t = makeTunnel("alice", "t-throw");
      // имитация: ws.close выбрасывает
      (t.ws as unknown as { close: () => never }).close = () => {
        throw new Error("ws already closed");
      };
      registerTunnel(t.conn);

      // Не должно падать — close в try/catch внутри revoke
      expect(() => revokeUserTunnels("alice")).not.toThrow();
      expect(hasTunnelForUser("alice")).toBe(false);
    });
  });

  describe("stats", () => {
    it("tracks counters correctly", () => {
      const { conn } = makeTunnel("alice", "t-s1");
      const { session } = makeBrowser("alice", "s-s1");
      registerTunnel(conn);
      registerBrowser(session);
      routeRequest({
        requestId: "r-s1",
        userId: "alice",
        browserSessionId: "s-s1",
        system: "",
        prompt: "",
        maxOutputTokens: 1000,
        temperature: 0,
      });
      handleTunnelResponse("r-s1", {
        type: "done",
        fullText: "<html></html>",
        durationMs: 100,
      });

      const stats = getStats();
      expect(stats.totalTunnelsRegistered).toBe(1);
      expect(stats.totalRequestsRouted).toBe(1);
      expect(stats.totalRequestsCompleted).toBe(1);
      expect(stats.totalRequestsFailed).toBe(0);
    });

    it("exposes maxConcurrentPerUser config in stats", () => {
      const stats = getStats();
      expect(typeof stats.maxConcurrentPerUser).toBe("number");
      expect(stats.maxConcurrentPerUser).toBeGreaterThan(0);
    });
  });
});
