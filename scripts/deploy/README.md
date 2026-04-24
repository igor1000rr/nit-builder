# Deploy artifacts (VPS production)

Single source of truth для production-инфраструктуры NIT Builder. Раньше
nginx-конфиг был раздвоен (`scripts/nginx.nit.vibecoding.by.conf` ↔ `scripts/deploy/nginx.conf`)
и расходился — теперь только один файл здесь.

## Файлы

- **`nginx.conf`** — production-ready конфиг с SSL, HSTS, WS upgrade,
  SSE без буферизации, X-Forwarded-For для rate-limit. Дублирует часть
  security headers из `entry.server.tsx` намеренно (страховка на 502).
- **`auto-deploy.sh`** — cron-friendly auto-pull → build → reload
  с `flock` (no overlap), `set -euo pipefail` (fail-fast), и проверкой
  health endpoint.

## Первичный деплой на новом VPS

```bash
# 1. Nginx
scp scripts/deploy/nginx.conf root@<vps>:/etc/nginx/sites-available/nit.vibecoding.by
ssh root@<vps> 'ln -sfn /etc/nginx/sites-available/nit.vibecoding.by /etc/nginx/sites-enabled/'
ssh root@<vps> 'nginx -t && systemctl reload nginx'

# 2. SSL через Let's Encrypt (DNS A nit.vibecoding.by → <vps> уже создан)
ssh root@<vps>
certbot --nginx -d nit.vibecoding.by
# После certbot заберите дифф ssl_* директив обратно в этот файл (git)

# 3. Auto-deploy через cron
scp scripts/deploy/auto-deploy.sh root@<vps>:/root/auto-deploy-nit.sh
ssh root@<vps> 'chmod +x /root/auto-deploy-nit.sh'
# crontab -e:
#   * * * * * /root/auto-deploy-nit.sh >> /var/log/nit-auto-deploy.log 2>&1
```

## Обновление nginx.conf

После любых правок в этом файле:

```bash
scp scripts/deploy/nginx.conf root@<vps>:/etc/nginx/sites-enabled/nit.vibecoding.by
ssh root@<vps> 'nginx -t && systemctl reload nginx'
```

Не забудьте `nginx -t` — синтаксическая ошибка положит весь nginx,
включая другие сайты.

## Переход в production mode (один раз)

```bash
ssh root@<vps>
cd /root/nit-builder
sed -i 's/NODE_ENV=development/NODE_ENV=production/' .env
pm2 restart nit-builder-v2 --update-env
```

## Cron для cleanup гостевых лимитов (рекомендуется)

```cron
0 3 * * * curl -sf -X POST -H "Authorization: Bearer $NIT_ADMIN_TOKEN" \
          https://nit.vibecoding.by/api/admin/guest-limits/cleanup \
          >> /var/log/nit-cleanup.log 2>&1
```

Без cleanup коллекция `nit_guest_limits` растёт ~365k записей/год.
