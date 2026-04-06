#!/usr/bin/env bash
#
# Cron-friendly auto-deploy для NIT Builder.
# Копировать на VPS в /root/auto-deploy-nit.sh, cron запись:
#
#   * * * * * /root/auto-deploy-nit.sh >> /var/log/nit-auto-deploy.log 2>&1
#
# Отличия от старого скрипта:
# - flock: два крона не пересекаются (если билд идёт >1 мин, следующий тик no-op)
# - set -euo pipefail: любая ошибка = abort, полусломанного прода больше не будет
# - Только нужный npm install (если изменился package.json или package-lock)
# - В конце — короткий health-check

set -euo pipefail

REPO_DIR=/root/nit-builder
LOCK_FILE=/tmp/nit-deploy.lock
PM2_APP=nit-builder-v2

# flock -n = сразу exit если лок занят
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[$(date -Is)] skip: another deploy is running"
  exit 0
fi

cd "$REPO_DIR"

OLD_SHA=$(git rev-parse HEAD)
git fetch --quiet origin main
NEW_SHA=$(git rev-parse origin/main)

if [ "$OLD_SHA" = "$NEW_SHA" ]; then
  exit 0
fi

echo "[$(date -Is)] deploy: $OLD_SHA → $NEW_SHA"

# Какие файлы изменились
CHANGED=$(git diff --name-only "$OLD_SHA" "$NEW_SHA")

git reset --hard "$NEW_SHA"

if echo "$CHANGED" | grep -qE '^(package\.json|package-lock\.json|shared/package\.json|tunnel/package\.json)$'; then
  echo "[$(date -Is)] npm install (deps changed)"
  npm install --silent
fi

echo "[$(date -Is)] npm run build"
npm run build

echo "[$(date -Is)] pm2 restart $PM2_APP"
pm2 restart "$PM2_APP" --update-env >/dev/null

# Health check — ждём 3с и дёргаем /api/health
sleep 3
if curl -fsS --max-time 5 http://127.0.0.1:3000/api/health >/dev/null; then
  echo "[$(date -Is)] ✓ deploy ok ($NEW_SHA)"
else
  echo "[$(date -Is)] ✗ health check FAILED after deploy"
  exit 1
fi
