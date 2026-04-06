# NIT Tunnel Desktop

Cross-platform GUI client for NIT Builder's peer-to-peer tunnel network.
Built with Tauri 2 + Rust backend + React UI.

## What it does

Proxies your local LM Studio (or other OpenAI-compatible endpoint) through
a persistent WebSocket to `nit.vibecoding.by`, so browsers talking to your
account can generate HTML pages using your GPU instead of paying for cloud
inference.

## Architecture

```
tunnel/desktop/
├── src-tauri/       Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/default.json
│   ├── icons/       (png/ico/icns bundle icons)
│   └── src/
│       ├── main.rs       — binary entry, calls lib::run()
│       ├── lib.rs        — Tauri setup + IPC commands
│       ├── protocol.rs   — Rust mirror of @nit/shared WebSocket types
│       ├── lm_studio.rs  — LM Studio streaming proxy (reqwest + SSE)
│       └── tunnel.rs     — WebSocket loop with reconnect + abort
└── ui/              React frontend
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── types.ts  (TS mirror of Rust types)
        └── components/
            ├── LoginForm.tsx
            ├── StatusDashboard.tsx
            └── LogPanel.tsx
```

## Development

### Prerequisites

- **Rust** 1.77+ — https://rustup.rs
- **Node.js** 20+
- **Platform SDKs:**
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Windows: Microsoft C++ Build Tools + WebView2 (usually preinstalled)
  - Linux: `sudo apt install libwebkit2gtk-4.1-dev libssl-dev pkg-config`

### First-time setup

```bash
cd tunnel/desktop

# Install Tauri CLI
cargo install tauri-cli --version "^2.0"

# Install UI deps
cd ui && npm install && cd ..

# Fetch Rust deps
cd src-tauri && cargo fetch && cd ..
```

### Run in dev mode

```bash
# From tunnel/desktop/
cargo tauri dev
```

This starts Vite dev server on :5174 and opens a Tauri window pointing at it.
Hot-reload works for both React UI and Rust backend.

### Build for production

```bash
cargo tauri build
```

Artifacts land in `src-tauri/target/release/bundle/`:
- macOS: `dmg/NIT Tunnel_0.1.0-alpha_x64.dmg`
- Windows: `nsis/NIT Tunnel_0.1.0-alpha_x64-setup.exe`
- Linux: `appimage/nit-tunnel_0.1.0-alpha_amd64.AppImage` + `deb/*.deb`

### Code signing (production releases)

**macOS:** requires Apple Developer account ($99/year):
```bash
export APPLE_CERTIFICATE="..."
export APPLE_CERTIFICATE_PASSWORD="..."
export APPLE_SIGNING_IDENTITY="Developer ID Application: ..."
export APPLE_ID="..."
export APPLE_TEAM_ID="..."
cargo tauri build --target universal-apple-darwin
```

**Windows:** requires code signing certificate (~$100-400/year). Configure in
`tauri.conf.json` under `bundle.windows.certificateThumbprint`.

**Linux:** no code signing needed for AppImage/deb.

## IPC Commands (Rust ↔ React)

| Command | Payload | Returns | Description |
|---|---|---|---|
| `start_tunnel` | `{server_url, token, lm_studio_url}` | `{ok, error}` | Start the tunnel runtime |
| `stop_tunnel` | - | `()` | Stop the runtime, close connection |
| `is_tunnel_running` | - | `bool` | Check if tunnel is active |
| `probe_lm_studio` | `{url}` | `{available, model, error}` | Test LM Studio reachability |

## Events (Rust → React via `listen("tunnel-event")`)

- `status_changed` — tunnel status transitions (idle/probing/connecting/connected/...)
- `request_started` / `request_progress` / `request_completed` / `request_failed`
- `log` — free-form log messages

## Configuration

Persisted via `tauri-plugin-store` in `config.bin`:
- `serverUrl` — default `wss://nit.vibecoding.by/api/tunnel`
- `token` — user's tunnel token (nit_...)
- `lmStudioUrl` — default `http://localhost:1234/v1`

Auto-start on boot is enabled by default via `tauri-plugin-autostart`.
Users can disable in OS settings.

## Known issues

- Rust code in Phase C was written without running `cargo check` (container
  didn't have Rust 1.77+). Expect 1-3 minor version incompatibilities that
  may need fixing on first build. See commits `Phase C.1` — `C.4`.
- Icons are placeholder blue gradients. Replace with real branding before
  production release.
- No code signing configured yet — first-time users will see Gatekeeper
  warnings on macOS and SmartScreen warnings on Windows.
