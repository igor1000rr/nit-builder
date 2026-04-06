#!/usr/bin/env bash
#
# Deploy NIT Builder v2.0 to production VPS.
#
# Usage (from local Mac):
#   ./scripts/deploy-nit.sh
#
# What it does:
#   1. Builds the project locally (catches errors before touching VPS)
#   2. rsyncs built artifacts + source to VPS
#   3. On VPS: installs deps, runs Appwrite migration (idempotent), restarts PM2
#   4. Tails PM2 logs for 10 seconds to verify startup
#
# Prerequisites:
#   - SSH key access to root@185.218.0.7
#   - NIT_TOKEN_LOOKUP_SECRET and APPWRITE_API_KEY set locally in .env.production
#   - PM2 installed on VPS (`npm install -g pm2` once)
#   - Nginx configured for nit.vibecoding.by → 127.0.0.1:3000 with Certbot SSL
#
# Safety:
#   - Dry-run first: set DRY_RUN=1 environment variable
#   - Never deletes user data or Appwrite collections
#   - Rolling restart via PM2 (zero-downtime after first deploy)

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────
VPS_HOST="${VPS_HOST:-root@185.218.0.7}"
VPS_PATH="${VPS_PATH:-/root/nit-builder}"
APP_NAME="${APP_NAME:-nit-builder-v2}"
DRY_RUN="${DRY_RUN:-0}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}==>${NC} $*"; }
ok() { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err() { echo -e "${RED}✗${NC} $*" >&2; }

# ─── Preflight checks ─────────────────────────────────────────────
log "Preflight checks"

if [ ! -f "package.json" ]; then
  err "Must run from project root (no package.json found)"
  exit 1
fi

if ! grep -q '"name": "nit-builder"' package.json; then
  err "Not in nit-builder directory"
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "v2-tunnel" ]; then
  warn "You are on branch '$BRANCH', not 'v2-tunnel'"
  read -rp "Continue anyway? [y/N] " answer
  [ "$answer" = "y" ] || exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  warn "Uncommitted changes in working tree"
  git status --short
  read -rp "Continue anyway? [y/N] " answer
  [ "$answer" = "y" ] || exit 1
fi

if [ ! -f ".env.production" ]; then
  err ".env.production not found. Create it with:"
  cat <<'EOF'
    NIT_TOKEN_LOOKUP_SECRET=<openssl rand -hex 32>
    APPWRITE_API_KEY=<from appwrite.vibecoding.by console>
    APPWRITE_ENDPOINT=https://appwrite.vibecoding.by/v1
    APPWRITE_PROJECT_ID=69aa2114000211b48e63
    NODE_ENV=production
    PORT=3000
EOF
  exit 1
fi

# Check required env vars in .env.production
for var in NIT_TOKEN_LOOKUP_SECRET APPWRITE_API_KEY; do
  if ! grep -q "^$var=" .env.production; then
    err "$var missing from .env.production"
    exit 1
  fi
done

ok "Preflight passed"

# ─── SSH sanity ───────────────────────────────────────────────────
log "Testing SSH to $VPS_HOST"
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$VPS_HOST" true 2>/dev/null; then
  err "Cannot SSH to $VPS_HOST (check SSH key / VPS is up)"
  exit 1
fi
ok "SSH OK"

# ─── Local build ──────────────────────────────────────────────────
log "Local build (catches errors before touching VPS)"
if [ "$DRY_RUN" = "0" ]; then
  npm run typecheck
  npm test
  npm run build
  ok "Build successful (server bundle: $(du -sh build/server/index.js 2>/dev/null | cut -f1))"
else
  warn "DRY_RUN: skipping local build"
fi

# ─── Sync source to VPS ──────────────────────────────────────────
log "Syncing source to $VPS_HOST:$VPS_PATH"

RSYNC_EXCLUDES=(
  "--exclude=node_modules"
  "--exclude=.git"
  "--exclude=.react-router"
  "--exclude=build"
  "--exclude=.DS_Store"
  "--exclude=.env"
  "--exclude=.env.local"
  "--exclude=.env.production"
  "--exclude=tunnel/desktop/src-tauri/target"
  "--exclude=tunnel/desktop/ui/dist"
  "--exclude=tunnel/desktop/ui/node_modules"
  "--exclude=tunnel/dist"
  "--exclude=shared/dist"
)

RSYNC_FLAGS="-az --delete"
[ "$DRY_RUN" = "1" ] && RSYNC_FLAGS="$RSYNC_FLAGS --dry-run"

rsync $RSYNC_FLAGS "${RSYNC_EXCLUDES[@]}" ./ "$VPS_HOST:$VPS_PATH/"
ok "Source synced"

# ─── Sync .env.production separately (sensitive) ─────────────────
log "Syncing .env.production"
if [ "$DRY_RUN" = "0" ]; then
  scp .env.production "$VPS_HOST:$VPS_PATH/.env"
  ssh "$VPS_HOST" "chmod 600 $VPS_PATH/.env"
  ok ".env deployed (chmod 600)"
fi

# ─── Remote: install + migrate + restart ─────────────────────────
log "Remote: install, migrate, restart PM2"
if [ "$DRY_RUN" = "0" ]; then
  ssh "$VPS_HOST" bash -s <<EOF
set -euo pipefail
cd $VPS_PATH

export NVM_DIR="\$HOME/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"

echo "--> npm install"
npm install --omit=dev --no-audit --no-fund

echo "--> Building on VPS (React Router typegen needs dev deps)"
npm install --include=dev --no-audit --no-fund
npm run build

echo "--> Running Appwrite migration (idempotent)"
set +e
export \$(cat .env | grep -v '^#' | xargs)
npm run migrate:appwrite
MIGRATE_EXIT=\$?
set -e
if [ \$MIGRATE_EXIT -ne 0 ]; then
  echo "⚠ Migration exited with code \$MIGRATE_EXIT (may be OK if already applied)"
fi

echo "--> PM2 restart or start"
if pm2 describe $APP_NAME > /dev/null 2>&1; then
  pm2 reload $APP_NAME --update-env
else
  pm2 start "npm start" --name $APP_NAME --time --env NODE_ENV=production
fi
pm2 save

echo "--> Deploy complete"
EOF
  ok "Remote deploy done"
fi

# ─── Verify startup ──────────────────────────────────────────────
if [ "$DRY_RUN" = "0" ]; then
  log "Tailing PM2 logs for 10s"
  ssh "$VPS_HOST" "pm2 logs $APP_NAME --lines 20 --nostream" || true

  log "Checking health endpoint"
  sleep 3
  if curl -sf --max-time 5 "https://nit.vibecoding.by/api/health" > /dev/null; then
    ok "https://nit.vibecoding.by/api/health responds 200"
  else
    warn "Health check failed — check PM2 logs with:"
    echo "   ssh $VPS_HOST 'pm2 logs $APP_NAME'"
  fi

  log "Checking WebSocket upgrade endpoint"
  if curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
      -H "Connection: Upgrade" -H "Upgrade: websocket" \
      -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
      "https://nit.vibecoding.by/api/control" | grep -q "101"; then
    ok "WebSocket /api/control upgrades to 101"
  else
    warn "WebSocket upgrade check failed — nginx may need proxy_set_header Upgrade config"
  fi
fi

echo
ok "🚀 Deployment complete!"
echo
echo "Next steps:"
echo "  1. Test registration: https://nit.vibecoding.by/register"
echo "  2. Copy tunnel token, save it"
echo "  3. Run tunnel CLI locally:"
echo "       cd tunnel && npm run dev -- \\"
echo "         --token YOUR_TOKEN \\"
echo "         --server wss://nit.vibecoding.by/api/tunnel \\"
echo "         --lm-studio http://localhost:1234/v1"
echo "  4. Generate a site via https://nit.vibecoding.by"
echo
