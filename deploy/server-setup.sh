#!/usr/bin/env bash
# Разворачивает Hauteline на чистом Ubuntu/Debian (Timeweb Cloud) и обновляет его при повторном запуске.
# Запуск от root:
#   DOMAIN=hauteline.ru EMAIL=you@mail.ru bash server-setup.sh     # с доменом и HTTPS
#   bash server-setup.sh                                           # без домена, сайт по IP (http)
set -euo pipefail

REPO="https://github.com/Traffer777/hauteline.git"
APP_DIR="/opt/hauteline"
DATA_DIR="/var/lib/hauteline"
ENV_FILE="/etc/hauteline.env"
APP_USER="hauteline"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"

[ "$(id -u)" = 0 ] || { echo "Запустите от root (sudo -i)"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "==> Пакеты"
apt-get update -y
apt-get install -y curl git nginx ca-certificates build-essential

echo "==> Node.js 24"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> Пользователь и папки"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$DATA_DIR"
chown "$APP_USER:$APP_USER" "$DATA_DIR"
chmod 700 "$DATA_DIR"

echo "==> Код"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 1 origin main
  git -C "$APP_DIR" reset --hard origin/main
else
  git clone --depth 1 "$REPO" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> Настройки"
if [ ! -f "$ENV_FILE" ]; then
  if [ -n "$DOMAIN" ]; then URL="https://$DOMAIN"; else URL="http://$(curl -fsS4 https://ifconfig.me || hostname -I | awk '{print $1}')"; fi
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
HL_TEST_MODE=0
HL_PUBLIC_URL=$URL
HL_DB_PATH=$DATA_DIR/hauteline.sqlite
EOF
  chmod 640 "$ENV_FILE"
  chown root:"$APP_USER" "$ENV_FILE"
fi
cat "$ENV_FILE"

echo "==> Сборка (несколько минут)"
sudo -u "$APP_USER" -H bash -c "cd $APP_DIR && npm ci --no-audit --no-fund && npm run build"

echo "==> Служба systemd"
cat > /etc/systemd/system/hauteline.service <<EOF
[Unit]
Description=Hauteline shop
After=network.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable hauteline >/dev/null
systemctl restart hauteline

echo "==> Команда для владельца: hauteline-owner"
cat > /usr/local/bin/hauteline-owner <<EOF
#!/usr/bin/env bash
set -a; . $ENV_FILE; set +a
cd $APP_DIR && exec sudo -E -u $APP_USER node scripts/owner.mjs "\$@"
EOF
chmod 755 /usr/local/bin/hauteline-owner

echo "==> nginx"
SERVER_NAME="${DOMAIN:-_}"
cat > /etc/nginx/sites-available/hauteline <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $SERVER_NAME ${DOMAIN:+www.$DOMAIN};
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
ln -sf /etc/nginx/sites-available/hauteline /etc/nginx/sites-enabled/hauteline
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
  echo "==> HTTPS (Let's Encrypt)"
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -n --agree-tos -m "$EMAIL" -d "$DOMAIN" -d "www.$DOMAIN" --redirect || \
    certbot --nginx -n --agree-tos -m "$EMAIL" -d "$DOMAIN" --redirect
fi

echo "==> Ежедневный бэкап базы в $DATA_DIR/backups (хранится 14 дней)"
cat > /etc/cron.daily/hauteline-backup <<EOF
#!/bin/sh
install -d -o $APP_USER -g $APP_USER -m 700 $DATA_DIR/backups
[ -f $DATA_DIR/hauteline.sqlite ] && sudo -u $APP_USER node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('$DATA_DIR/hauteline.sqlite').exec(\"VACUUM INTO '$DATA_DIR/backups/hauteline-\$(date +%F).sqlite'\")"
find $DATA_DIR/backups -name '*.sqlite' -mtime +14 -delete
EOF
chmod 755 /etc/cron.daily/hauteline-backup
chown "$APP_USER:$APP_USER" "$DATA_DIR"

ok=0; for i in $(seq 1 30); do curl -fsS -o /dev/null http://127.0.0.1:3000/api/catalog && { ok=1; break; }; sleep 1; done  # первый запрос создаёт базу
if [ "$ok" = 1 ]; then echo; echo "ГОТОВО. Сайт работает: $(grep HL_PUBLIC_URL $ENV_FILE | cut -d= -f2)"; else echo "Сайт не отвечает, смотрите: journalctl -u hauteline -n 50"; fi
echo "Создать владельца: hauteline-owner create почта@mail.ru \"Имя\""
