# NIT Builder v2.0 — Tunnel Architecture

**Status:** Phase A ✅ + Phase B ✅ complete, Phase C scaffold ⏳
**Started:** 2026-04-06
**Last updated:** 2026-04-06 (Phase C.1 scaffold)
**Target:** v2.0.0 stable after Phase C ready + deployed to nit.vibecoding.by

---

## Core idea

NIT Builder v2.0 превращает продукт из **stateless cloud AI tool** в **peer-to-peer distributed compute network**. Каждый юзер приносит свой GPU, VPS только маршрутизирует запросы.

### Old model (v1.x)
```
Browser → VPS → Groq/LM Studio API → Browser
```
VPS либо платит за облачный API, либо подключается к одной локальной LM Studio. Не масштабируется.

### New model (v2.0)
```
Browser → VPS control WS → Tunnel Registry → User's Tunnel Client → LM Studio → обратно
```
VPS — dumb router. Вся compute на клиентах. Zero cloud costs, infinite scaling.

---

## Architecture diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VPS 185.218.0.7                              │
│                                                                       │
│  ┌──────────────────┐   ┌─────────────────────┐   ┌──────────────┐ │
│  │  React Router v7 │   │ Appwrite (existing) │   │  Nginx SSL   │ │
│  │  SSR + SSE       │◄──┤ Users/sessions/     │   │  reverse     │ │
│  │                  │   │ history             │   │  proxy       │ │
│  └────────┬─────────┘   └─────────────────────┘   └──────┬───────┘ │
│           │                                               │          │
│           │ in-process                                    │          │
│           ▼                                               │          │
│  ┌──────────────────────────────────────┐                │          │
│  │  TunnelRegistry (singleton)          │                │          │
│  │                                       │                │          │
│  │  tunnels:  Map<userId, WSConnection> │                │          │
│  │  pending:  Map<requestId, Deferred>  │                │          │
│  │  sessions: Map<browserWS, userId>    │                │          │
│  └────┬─────────────────────────┬───────┘                │          │
│       │                         │                         │          │
│       │ ws                      │ ws                      │          │
│       ▼                         ▼                         │          │
│  ┌──────────────┐      ┌────────────────┐                │          │
│  │ /api/tunnel  │      │ /api/control   │                │          │
│  │ (clients)    │      │ (browsers)     │                │          │
│  └──────┬───────┘      └────────┬───────┘                │          │
└─────────┼──────────────────────┼─────────────────────────┼──────────┘
          │                      │                          │
          │ wss (desktop)        │ wss (browser)           │ https
          │                      │                          │
          ▼                      ▼                          ▼
  ┌────────────────┐    ┌─────────────────┐       ┌───────────────┐
  │ NIT Tunnel     │    │ Browser (any    │       │  React SSR    │
  │ (Tauri)        │    │  device)        │       │  pages        │
  │                │    │                 │       └───────────────┘
  │ LM Studio OR   │    │  Just chat UI,  │
  │ embedded       │    │  no GPU         │
  │ llama.cpp      │    │                 │
  │                │    └─────────────────┘
  └────────┬───────┘
           │ http://localhost:1234
           ▼
  ┌────────────────┐
  │  LM Studio     │
  │  Qwen-7B       │
  │  (user's GPU)  │
  └────────────────┘
```

---

## Decisions

### Auth: Appwrite email/password

Используем существующий Appwrite instance (`appwrite.vibecoding.by`), project `69ab07130011752aae12`. Создаём новые коллекции в базе `nit_builder`:

- `nit_users` — extends `users` table, добавляет: `tunnelToken` (unique, 32 bytes hex), `tunnelCreatedAt`, `preferredProvider`, `apiKeys` (encrypted JSON: groq, openrouter)
- `nit_sites` — "Мои сайты": `userId`, `prompt`, `html`, `templateId`, `templateName`, `createdAt`, `updatedAt`, `thumbnail` (optional SVG)
- `nit_generations` — audit log: `userId`, `mode` (create/polish), `provider` (tunnel/groq), `durationMs`, `success`, `errorReason`, `createdAt`

Permissions per-user через Appwrite row-level security.

### Tunnel client: Tauri desktop + embedded runtime

Tauri daemon с React GUI. Поддерживает 2 режима:
1. **Proxy mode** — фон определяет запущенную LM Studio на `localhost:1234`, проксирует запросы
2. **Embedded mode** — использует встроенный `llama.cpp` runtime через Rust FFI, юзер качает GGUF модель прямо из UI клиента

Поставляется как:
- `.dmg` для macOS (universal binary x64+arm64, signed)
- `.exe` installer для Windows
- `.AppImage` + `.deb` для Linux

### Monorepo structure

```
nit-builder/
├── app/                    # React Router v7 VPS backend
├── tunnel/                 # NEW: Tauri desktop client
│   ├── src/               # Rust backend
│   ├── ui/                # React frontend (внутри Tauri)
│   ├── src-tauri/         # Tauri config
│   └── package.json       # отдельный package.json
├── shared/                 # NEW: types shared between VPS and tunnel
│   ├── protocol.ts        # WebSocket message types
│   └── package.json       # exports as local npm module
├── docs/
└── ...
```

npm workspaces для управления: root `package.json` имеет `"workspaces": ["app", "tunnel", "shared"]`.

### Fallback strategy

Юзер может работать в трёх режимах:
1. **Tunnel mode** (предпочтительный) — свой GPU через Tauri клиент
2. **Cloud mode** — если юзер задал `GROQ_API_KEY` в настройках профиля, VPS шлёт через Groq (используя ключ юзера)
3. **Demo mode** (для анонимов без регистрации) — VPS использует свой общий Groq ключ с строгим rate limit 3 запроса в час по IP

---

## WebSocket protocol

### Common envelope

Все сообщения в обе стороны — JSON объекты с обязательным полем `type` и `requestId` (если относятся к конкретному запросу).

```typescript
// shared/protocol.ts
export type TunnelToServerMessage =
  | { type: "hello"; token: string; clientVersion: string; capabilities: TunnelCapabilities }
  | { type: "heartbeat" }
  | { type: "response_start"; requestId: string }
  | { type: "response_text"; requestId: string; text: string }
  | { type: "response_done"; requestId: string; fullText: string; durationMs: number }
  | { type: "response_error"; requestId: string; error: string };

export type ServerToTunnelMessage =
  | { type: "welcome"; serverVersion: string; userId: string }
  | { type: "heartbeat_ack" }
  | { type: "generate"; requestId: string; system: string; prompt: string; maxOutputTokens: number; temperature: number; model?: string }
  | { type: "abort"; requestId: string };

export type TunnelCapabilities = {
  runtime: "lmstudio_proxy" | "embedded";
  model: string;
  contextWindow: number;
  gpu?: { vendor: string; vram: number };
};

export type BrowserToServerMessage =
  | { type: "auth"; sessionToken: string }
  | { type: "generate"; requestId: string; mode: "create" | "polish"; prompt: string; sessionId?: string }
  | { type: "abort"; requestId: string };

export type ServerToBrowserMessage =
  | { type: "authed"; userId: string; tunnelStatus: "online" | "offline" }
  | { type: "tunnel_status"; status: "online" | "offline" }
  | { type: "generate_start"; requestId: string; step: "plan" | "template" | "code" }
  | { type: "generate_text"; requestId: string; text: string }
  | { type: "generate_done"; requestId: string; html: string; templateId: string; templateName: string }
  | { type: "generate_error"; requestId: string; error: string };
```

### Connection lifecycle — tunnel client

1. **Connect:** `wss://nit.vibecoding.by/api/tunnel`
2. **Hello:** клиент шлёт `{ type: "hello", token, clientVersion, capabilities }`
3. **Auth:** сервер валидирует токен в Appwrite → находит `userId` → регистрирует в `tunnelRegistry[userId] = ws`
4. **Welcome:** сервер шлёт `{ type: "welcome", serverVersion, userId }`
5. **Broadcast:** сервер шлёт всем активным браузерам этого юзера `{ type: "tunnel_status", status: "online" }`
6. **Heartbeat:** каждые 15 секунд клиент шлёт `{ type: "heartbeat" }`, сервер отвечает `heartbeat_ack`. Если 3 пропуска подряд → сервер закрывает соединение.
7. **Disconnect:** сервер убирает из registry, броадкастит `tunnel_status: offline` всем вкладкам юзера.

### Connection lifecycle — browser

1. **Connect:** `wss://nit.vibecoding.by/api/control`
2. **Auth:** браузер шлёт `{ type: "auth", sessionToken: <Appwrite session JWT> }`
3. **Authed:** сервер валидирует через Appwrite SDK → находит `userId` → связывает этот WS с userId → шлёт `{ type: "authed", userId, tunnelStatus }`
4. **Generate:** юзер жмёт "Создать", браузер шлёт `{ type: "generate", requestId, mode: "create", prompt }`
5. **Server orchestration:** сервер получает запрос → находит `tunnel = tunnelRegistry[userId]` → формирует planner/coder prompts через existing orchestrator логику → шлёт в туннель `{ type: "generate", requestId, system, prompt, ... }`
6. **Streaming:** туннель стримит `response_text` события → сервер пересылает их в браузер как `generate_text`
7. **Done:** туннель шлёт `response_done` → сервер шлёт браузеру `generate_done` с финальным HTML

### Multi-tab handling

Один юзер может открыть 5 вкладок. У каждой вкладки свой WS к `/api/control`. Sessions table:

```typescript
sessions: Map<string, { userId: string; ws: WebSocket }>;
// key = ws instance ID (random per connection)
```

При получении `generate_done` — сервер ищет вкладку по `requestId`, пересылает **только ей**. Другие вкладки не получают событие.

При отключении туннеля — сервер шлёт `tunnel_status: offline` **всем** вкладкам этого юзера.

### Abort handling

Юзер закрывает вкладку в процессе генерации:
1. WebSocket браузера закрывается
2. Сервер находит активные `requestId` этой вкладки
3. Шлёт туннелю `{ type: "abort", requestId }` для каждого
4. Туннель должен прервать локальный `streamText` call к LM Studio (через AbortController)

### Multi-tunnel per user

Юзер может запустить клиент на Mac и на Windows одновременно. Оба коннектятся одним токеном. Стратегия:

- **`tunnelRegistry[userId]` — это массив**, не одно соединение
- При `generate` — выбираем **первое доступное** (round-robin можно добавить позже)
- `tunnel_status` = online если в массиве хотя бы один туннель

---

## Security considerations

### Tunnel token
- 32-байтовый random hex (`crypto.randomBytes(32).toString("hex")`)
- Хранится в Appwrite в хешированном виде (argon2id)
- Передаётся клиенту один раз при регистрации + через "reveal token" в настройках профиля (требует пароль)
- Revoke: генерируем новый, старый invalidated. Все активные туннели со старым токеном отключаются.

### Appwrite session JWT
- Для `/api/control` — Appwrite session token, валидируется через Appwrite SDK на сервере
- Live time 7 дней
- На стороне клиента хранится в HttpOnly cookie

### CORS & CSRF
- `/api/tunnel` не имеет CORS (это WebSocket от desktop app, не из браузера) — проверяем `Origin` заголовок, если есть — **отклоняем**
- `/api/control` — строгий `Origin` check на совпадение с `nit.vibecoding.by`

### Rate limiting
- Per-user: 100 генераций в час (через Appwrite logs)
- Per-IP: 20 connections в час к `/api/tunnel` (защита от bruteforce токенов)
- Per-tunnel: 5 одновременных активных requests (защита LM Studio от перегрузки)

### Sandbox
- Все сгенерированные HTML в iframe с `sandbox="allow-scripts"` (без `allow-same-origin`)
- CSP на основном сайте не меняется

---

## Phase breakdown

### Phase A: Tunnel protocol MVP ✅ **COMPLETE** (commit cae6024)
- [x] `shared/src/protocol.ts` — все типы сообщений
- [x] `app/lib/services/tunnelRegistry.server.ts` — in-memory Map для туннелей (Map<userId, TunnelConnection[]>, Map<sessionId, BrowserSession>, Map<requestId, PendingRequest>)
- [x] WebSocket endpoints `/api/tunnel` и `/api/control` через custom `server.ts` (не через API route)
- [x] `app/lib/server/wsHandlers.server.ts` — handleTunnelConnection + handleControlConnection
- [x] `tunnel/src/` — Node.js CLI (`npx nit-tunnel`) с reconnect, heartbeat, abort propagation
- [x] E2E verified: mock LM Studio на :9999 + CLI → handshake + stream работает
- 19 новых тестов для `tunnelRegistry.server.ts`

**Exit criteria MET:** WebSocket upgrade возвращает HTTP 101, валидный dev token → `✓ Authenticated`, невалидный → `INVALID_TOKEN` + retry loop.

### Phase B: Appwrite auth integration ✅ **COMPLETE** (commits 8159e60 → 921a9cd)

**B.1 — SDK wrapper + tunnel tokens (8159e60)**
- [x] Коллекции `nit_users`, `nit_sites`, `nit_generations` через `scripts/appwrite-migrate.ts` (idempotent)
- [x] `app/lib/server/appwrite.server.ts` — typed SDK wrapper
- [x] `app/lib/server/tunnelTokens.server.ts` — **two-field scheme**: HMAC-SHA256 lookup + argon2id hash (random-salt argon2 alone не работает — нельзя query DB по хэшу с random salt)
- [x] 22 новых теста для tunnelTokens

**B.2 — Auth endpoints (1d93712)**
- [x] `/api/auth/register` — Zod validated, creates user + tunnel token, HttpOnly cookie
- [x] `/api/auth/login` — rate limited 10/min/IP, creates session
- [x] `/api/auth/logout` — clears cookie + Appwrite session
- [x] `/api/auth/me` — returns auth state + live tunnel status from registry
- [x] `/api/auth/regenerate-tunnel-token` — requires password re-entry
- [x] `app/lib/server/sessionCookie.server.ts` + `requireAuth.server.ts`

**B.3 — wsHandlers Appwrite integration (a5fd57b)**
- [x] Replaced dev-stub `validateTunnelToken` with real `findUserByTunnelToken` (HMAC lookup → argon2 verify)
- [x] Browser WebSocket auto-auth via `Cookie` header on upgrade (no handshake message)
- [x] Dev fallback preserved when `APPWRITE_API_KEY` unset

**B.4 — Login/register UI (a8c3b4a)**
- [x] `/login` + `/register` routes with Russian forms
- [x] Register two-step flow: form → token reveal screen (shown once) + copy-to-clipboard
- [x] SettingsDrawer: Account section (email, tunnel status, logout) + Tunnel Token section (regenerate with password re-entry)

**B.5 — home.tsx WebSocket integration (a617ed7)**
- [x] `app/lib/hooks/useAuth.ts` — fetches `/api/auth/me` once
- [x] `app/lib/hooks/useControlSocket.ts` — WebSocket manager with exponential backoff, heartbeat, typed events
- [x] Dual-path `createSite`/`polishSite`: WebSocket if authed+tunnel online, HTTP fallback
- [x] Tunnel status indicator in nav, offline banner, sign-up CTA

**B.6 — Мои сайты → Appwrite (921a9cd)**
- [x] `/api/sites` GET list + POST save (Zod validated)
- [x] `/api/sites/:id` GET one (with HTML) + DELETE (ownership check)
- [x] `app/lib/stores/remoteHistoryStore.ts` — Appwrite-backed client + migration helper
- [x] `HistoryPanel` dual-source: localStorage для гостей, Appwrite для authed
- [x] Auto-migration from localStorage → Appwrite on first authed open
- [x] Fire-and-forget `saveRemoteSite` in both WS and HTTP generation paths

**Exit criteria MET:** Юзер регистрируется → получает plaintext токен → запускает `tunnel/` CLI → открывает `/` → WebSocket auto-auth via cookie → generates sites through tunnel → sees them on "Мои сайты" across devices. Ownership checks return 401/404 without session cookie (runtime verified). 175/175 tests passing.

### Phase C: Tauri GUI client ⏳ **SCAFFOLD COMPLETE** (commits 2d1d939, 41c8fe4)

- [x] `tunnel/desktop/src-tauri/` Tauri 2 scaffold (Cargo.toml, tauri.conf.json, build.rs, capabilities, icons)
- [x] `src/protocol.rs` — Rust mirror of `@nit/shared` protocol types
- [x] `src/lm_studio.rs` — `LmStudioProxy` with probe() + stream_chat() + CancellationToken abort
- [x] `src/tunnel.rs` — Full runtime: spawn(), run_loop() with exponential backoff 5s→60s, connect_and_serve() with:
  - `outgoing_tx` mpsc channel for single ws_write sink (avoids borrow conflicts)
  - Per-request `tokio::spawn` tasks so main loop stays responsive
  - Shared `Arc<LmStudioProxy>` across all generate tasks
  - HashMap tracking for per-request CancellationTokens
- [x] `src/lib.rs` — 4 IPC commands: start_tunnel, stop_tunnel, is_tunnel_running, probe_lm_studio
- [x] `ui/` React 19 + Vite 6 + Tauri API v2
- [x] UI components: LoginForm (with LM Studio test button), StatusDashboard (pulsing status header), LogPanel
- [x] Config persistence via `@tauri-apps/plugin-store`
- [x] `.github/workflows/tunnel-release.yml` — cross-platform CI (macOS arm64+x86, Windows, Linux)
- [x] Placeholder icons (32x32/128x128/128x128@2x/icon.png/.icns/.ico)
- [x] Root `package.json` workspaces updated
- [x] Full README with build instructions + known issues

**Not yet done in Phase C:**
- [ ] **`cargo check` verification** — container has Rust 1.75 but Tauri 2 deps require 1.85+, written blind. Expect 1-3 small fixes on Igor's first `cargo tauri dev`.
- [ ] Real branding icons (current ones are placeholder blue gradient)
- [ ] Code signing setup (Apple Developer $99/year + Windows cert ~$100-400/year)
- [ ] End-to-end test with real Appwrite + real LM Studio + real Tauri build

**Exit criteria for C complete:** Юзер скачивает `.dmg`/`.exe`/`.AppImage` → устанавливает → вводит токен → видит "Подключён" → `nit.vibecoding.by` генерирует сайты через его GPU. Signed binaries на GitHub Releases.

### Phase D: Embedded llama.cpp runtime ⏳ **NOT STARTED** (optional, may defer to v2.1)
- [ ] `llama-cpp-2` Rust crate integration
- [ ] Model download manager в GUI (прогресс бар, resume, Hugging Face API)
- [ ] Пресеты моделей: Qwen2.5-Coder-7B-Q4, Qwen2.5-Coder-3B-Q4, Llama-3.2-3B-Q4
- [ ] GPU detection: CUDA (Windows/Linux), Metal (macOS), Vulkan (fallback)
- [ ] Автоматический выбор Q-уровня квантизации по доступной VRAM
- [ ] CPU fallback для пользователей без GPU
- [ ] Бенчмарк при первом запуске: измеряем токены/сек

**Exit criteria:** юзер устанавливает клиент, жмёт "Скачать модель", через 5 минут без LM Studio всё работает.

---

## Open questions (still TBD)

1. **Persistence туннелей между рестартами VPS:** при рестарте `tunnelRegistry` очищается, клиенты должны переподключиться. Делать ли warm-up notification? **Ответ:** нет, reconnect в клиенте через 5 секунд достаточно.
2. **Cross-origin WebSocket auth:** Appwrite session cookie → browser → WebSocket cookie flow. Проверить что Appwrite SDK умеет `account.createJWT()` для WebSocket auth. **Ответ:** да, Appwrite JWT есть, срок 15 минут, перевыпускать через refresh.
3. **Embedded runtime license:** llama.cpp под MIT, Rust binding `llama-cpp-2` под MIT. OK для коммерческого использования.
4. **Model hosting:** качать с Hugging Face напрямую? Да, нет необходимости в CDN.
