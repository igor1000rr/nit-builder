# Deploy (VPS 185.218.0.7)

Файлы в этой папке — источники правды для nginx и auto-deploy скрипта.
При изменении — обновить на VPS вручную:

```bash
# nginx
scp scripts/deploy/nginx.conf root@185.218.0.7:/etc/nginx/sites-enabled/nit.vibecoding.by
ssh root@185.218.0.7 'nginx -t && systemctl reload nginx'

# auto-deploy
scp scripts/deploy/auto-deploy.sh root@185.218.0.7:/root/auto-deploy-nit.sh
ssh root@185.218.0.7 'chmod +x /root/auto-deploy-nit.sh'
```

## Переход на production mode

```bash
ssh root@185.218.0.7
cd /root/nit-builder
sed -i 's/NODE_ENV=development/NODE_ENV=production/' .env
pm2 restart nit-builder-v2 --update-env
```

## HTTPS через Let's Encrypt

Требует DNS `nit.vibecoding.by → 185.218.0.7` (A record).

```bash
certbot --nginx -d nit.vibecoding.by
# certbot сам пропишет ssl_* директивы в конфиг — потом синхронизируй назад в git
```
