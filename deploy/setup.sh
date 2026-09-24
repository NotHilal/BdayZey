#!/usr/bin/env bash
# One-time setup of a fresh Hetzner Ubuntu server (run as root on the server):
#   bash /srv/zsq/deploy/setup.sh <domain>
# <domain> can be your own domain pointing at the server, or, without one,
# <ip-with-dashes>.sslip.io (e.g. 49-12-34-56.sslip.io) which resolves to the IP.
set -euo pipefail
DOMAIN="${1:?usage: setup.sh <domain>}"

apt-get update
apt-get install -y curl gnupg debian-keyring debian-archive-keyring apt-transport-https

# Node.js 22 (for the relay)
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy (web server + automatic HTTPS)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# relay service
id -u zsq >/dev/null 2>&1 || useradd --system --home /srv/zsq --shell /usr/sbin/nologin zsq
(cd /srv/zsq/server && npm install --omit=dev --no-audit --no-fund)
chown -R zsq:zsq /srv/zsq
cp /srv/zsq/deploy/zsq-relay.service /etc/systemd/system/zsq-relay.service
systemctl daemon-reload
systemctl enable --now zsq-relay
systemctl restart zsq-relay

# Caddy site
sed "s/{\$DOMAIN}/$DOMAIN/" /srv/zsq/deploy/Caddyfile > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

# firewall: ssh + web only
if command -v ufw >/dev/null; then ufw allow OpenSSH; ufw allow 80; ufw allow 443; ufw --force enable; fi

echo "Done. Open https://$DOMAIN"
